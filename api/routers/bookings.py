"""
Booking endpoints.

State machine
─────────────
  pending    → confirmed  (guide accepts)
             → cancelled  (guide declines OR tourist cancels before confirmation)
  confirmed  → in_progress (guide starts the trip)
             → cancelled   (tourist cancels ≥24h before start; guide cancels any time)
  in_progress → completed  (guide marks done)
              → disputed   (either party raises a dispute)
  completed  → (terminal — tourist can leave a review)
  cancelled  → (terminal)
  disputed   → (NTB resolves via admin API — no direct transition here)

Commission model
────────────────
  Platform takes 12% of total_amount_usd.
  Guide receives 88% (guide_payout_usd = total_amount_usd - platform_commission_usd).
  The 12% rate is the mid-point of the 10–15% band; tune per booking_type later.

Push notifications
──────────────────
  All notifications are fire-and-forget. A failed push never rolls back a booking.
  The guide is notified when a new booking is created (pending → guide sees request).
  The tourist is notified when the guide confirms or cancels.

Security
────────
  - tourist_id is resolved from the JWT on create — the client never supplies it.
  - guide_id on create is the booked guide (client-supplied and required).
  - Status transitions are validated against a per-role allowed-transitions map.
    A tourist cannot confirm their own booking; a guide cannot mark it completed
    before it's in_progress.
  - RLS on the bookings table ensures each user only sees their own bookings
    (tourist_id = auth.uid() OR guide's user_id = auth.uid()).
"""

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator

from db.client import get_admin_supabase, get_user_scoped_supabase
from middleware.request_id import get_request_id
from routers.auth import CurrentUser, get_current_user
from tools.email import fire_and_forget
from tools.push import (
    notify_guide_booking_cancelled,
    notify_guide_new_booking,
    notify_tourist_booking_cancelled,
    notify_tourist_booking_confirmed,
    upsert_push_token,
)

logger = structlog.get_logger(__name__)
router = APIRouter()

COMMISSION_RATE = 0.12

# ─── State machine ────────────────────────────────────────────────────────────

# Maps (current_status, actor_role) → allowed next statuses
_TRANSITIONS: dict[tuple[str, str], set[str]] = {
    ("pending",     "guide"):   {"confirmed", "cancelled"},
    ("pending",     "tourist"): {"cancelled"},
    ("confirmed",   "guide"):   {"in_progress", "cancelled"},
    ("confirmed",   "tourist"): {"cancelled"},
    ("in_progress", "guide"):   {"completed", "disputed"},
    ("in_progress", "tourist"): {"disputed"},
}


def _validate_transition(current: str, new: str, role: str) -> None:
    allowed = _TRANSITIONS.get((current, role), set())
    if new not in allowed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Cannot transition from '{current}' to '{new}' as {role}. "
                   f"Allowed: {sorted(allowed) or 'none'}",
        )


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_tourist_id(user_id: str) -> str:
    result = get_admin_supabase().table("tourists").select("id").eq("user_id", user_id).limit(1).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="No tourist profile found for this user")
    return result.data[0]["id"]


def _get_guide_user_id(guide_id: str) -> str | None:
    result = get_admin_supabase().table("guides").select("user_id").eq("id", guide_id).limit(1).execute()
    return result.data[0]["user_id"] if result.data else None


def _get_tourist_user_id(tourist_id: str) -> str | None:
    result = get_admin_supabase().table("tourists").select("user_id").eq("id", tourist_id).limit(1).execute()
    return result.data[0]["user_id"] if result.data else None


def _get_user_name(user_id: str) -> str:
    result = get_admin_supabase().table("users").select("full_name, email").eq("id", user_id).limit(1).execute()
    if result.data:
        return result.data[0].get("full_name") or result.data[0].get("email") or "Someone"
    return "Someone"


def _get_guide_name(guide_id: str) -> str:
    result = get_admin_supabase().table("guides").select("name").eq("id", guide_id).limit(1).execute()
    return result.data[0]["name"] if result.data else "Your Guide"


# ─── Push token registration ──────────────────────────────────────────────────

class RegisterPushTokenRequest(BaseModel):
    token: str
    platform: str

    @field_validator("platform")
    @classmethod
    def platform_valid(cls, v: str) -> str:
        if v not in ("ios", "android", "web"):
            raise ValueError("platform must be ios, android, or web")
        return v


@router.post("/push-token", status_code=204)
async def register_push_token(
    body: RegisterPushTokenRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> None:
    """Register or refresh the Expo push token for this device."""
    upsert_push_token(current_user.id, body.token, body.platform)


# ─── Booking creation ─────────────────────────────────────────────────────────

class CreateBookingRequest(BaseModel):
    guide_id: str
    trip_id: str | None = None
    booking_type: str
    start_date: str
    end_date: str
    total_amount_usd: float
    notes: str | None = None

    @field_validator("booking_type")
    @classmethod
    def type_valid(cls, v: str) -> str:
        if v not in ("day_trip", "multi_day", "custom"):
            raise ValueError("booking_type must be day_trip, multi_day, or custom")
        return v

    @field_validator("total_amount_usd")
    @classmethod
    def amount_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("total_amount_usd must be positive")
        return v


@router.post("", status_code=201)
async def create_booking(
    body: CreateBookingRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """
    Create a booking request. Only tourists can create bookings.
    tourist_id is resolved server-side from the JWT — the client cannot spoof it.
    """
    tourist_id = _get_tourist_id(current_user.id)

    # Verify the guide exists and is verified
    guide_check = get_admin_supabase().table("guides").select(
        "id, verification_status, is_available"
    ).eq("id", body.guide_id).limit(1).execute()
    if not guide_check.data:
        raise HTTPException(status_code=404, detail="Guide not found")
    guide = guide_check.data[0]
    if guide["verification_status"] != "verified":
        raise HTTPException(status_code=422, detail="Guide is not yet verified by NTB")
    if not guide["is_available"]:
        raise HTTPException(status_code=422, detail="Guide is not currently available")

    commission = round(body.total_amount_usd * COMMISSION_RATE, 2)
    payout = round(body.total_amount_usd - commission, 2)

    supabase = get_user_scoped_supabase(current_user.access_token)
    result = supabase.table("bookings").insert({
        "tourist_id": tourist_id,
        "guide_id": body.guide_id,
        "trip_id": body.trip_id,
        "booking_type": body.booking_type,
        "start_date": body.start_date,
        "end_date": body.end_date,
        "total_amount_usd": body.total_amount_usd,
        "platform_commission_usd": commission,
        "guide_payout_usd": payout,
        "notes": body.notes,
        "status": "pending",
    }).execute()

    booking = result.data[0]

    # Notify the guide — fire-and-forget
    guide_user_id = _get_guide_user_id(body.guide_id)
    if guide_user_id:
        tourist_name = _get_user_name(current_user.id)
        fire_and_forget(
            notify_guide_new_booking(guide_user_id, tourist_name, body.start_date, booking["id"])
        )

    logger.info(
        "booking_created",
        request_id=get_request_id(),
        booking_id=booking["id"],
        guide_id=body.guide_id,
        tourist_user_id=current_user.id,
        total_usd=body.total_amount_usd,
    )
    return booking


# ─── Booking reads ────────────────────────────────────────────────────────────

@router.get("")
async def list_my_bookings(current_user: CurrentUser = Depends(get_current_user)) -> dict:
    """
    List bookings for the authenticated user.
    RLS scopes results to bookings where the caller is the tourist or guide.
    Returns full booking rows with joined guide/tourist name for display.
    """
    supabase = get_user_scoped_supabase(current_user.access_token)
    result = supabase.table("bookings").select(
        "*, guides(name, photo_url, location)"
    ).order("created_at", desc=True).execute()
    return {"bookings": result.data or []}


@router.get("/{booking_id}")
async def get_booking(
    booking_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    supabase = get_user_scoped_supabase(current_user.access_token)
    result = supabase.table("bookings").select(
        "*, guides(name, photo_url, location, phone)"
    ).eq("id", booking_id).limit(1).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Booking not found")
    return result.data[0]


# ─── Status transitions ───────────────────────────────────────────────────────

class UpdateBookingStatusRequest(BaseModel):
    status: str


@router.patch("/{booking_id}/status")
async def update_booking_status(
    booking_id: str,
    body: UpdateBookingStatusRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """
    Advance a booking through the state machine.

    The caller's role (tourist vs. guide) determines which transitions are allowed.
    A 422 is returned for invalid transitions with a human-readable explanation.
    """
    admin = get_admin_supabase()

    # Load current booking to check ownership and current state
    current = admin.table("bookings").select(
        "id, status, tourist_id, guide_id, start_date"
    ).eq("id", booking_id).limit(1).execute()
    if not current.data:
        raise HTTPException(status_code=404, detail="Booking not found")

    booking = current.data[0]

    # Determine caller's role in this booking
    tourist_row = admin.table("tourists").select("id, user_id").eq("id", booking["tourist_id"]).limit(1).execute()
    guide_row = admin.table("guides").select("user_id").eq("id", booking["guide_id"]).limit(1).execute()

    tourist_user_id = tourist_row.data[0]["user_id"] if tourist_row.data else None
    guide_user_id = guide_row.data[0]["user_id"] if guide_row.data else None

    if current_user.id == guide_user_id:
        actor_role = "guide"
    elif current_user.id == tourist_user_id:
        actor_role = "tourist"
    else:
        raise HTTPException(status_code=403, detail="You are not a party to this booking")

    _validate_transition(booking["status"], body.status, actor_role)

    # Write the update using the user-scoped client (RLS verifies ownership again)
    supabase = get_user_scoped_supabase(current_user.access_token)
    result = supabase.table("bookings").update({"status": body.status}).eq("id", booking_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Booking update failed")

    updated = result.data[0]

    # ── Push notifications on key transitions ─────────────────────────────────
    if body.status == "confirmed" and tourist_user_id:
        guide_name = _get_guide_name(booking["guide_id"])
        fire_and_forget(notify_tourist_booking_confirmed(tourist_user_id, guide_name, booking_id))

    elif body.status == "cancelled":
        if actor_role == "guide" and tourist_user_id:
            guide_name = _get_guide_name(booking["guide_id"])
            fire_and_forget(notify_tourist_booking_cancelled(tourist_user_id, guide_name, booking_id))
        elif actor_role == "tourist" and guide_user_id:
            tourist_name = _get_user_name(tourist_user_id) if tourist_user_id else "Tourist"
            fire_and_forget(notify_guide_booking_cancelled(guide_user_id, tourist_name, booking_id))

    logger.info(
        "booking_status_updated",
        request_id=get_request_id(),
        booking_id=booking_id,
        from_status=booking["status"],
        to_status=body.status,
        actor_role=actor_role,
        actor_id=current_user.id,
    )
    return updated
