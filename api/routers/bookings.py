from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from db.client import get_user_scoped_supabase
from routers.auth import CurrentUser, get_current_user

router = APIRouter()

COMMISSION_RATE = 0.12  # mid-point of the 10-15% commission band; tune per booking_type later


class CreateBookingRequest(BaseModel):
    trip_id: str | None = None
    guide_id: str | None = None
    booking_type: str
    start_date: str | None = None
    end_date: str | None = None
    total_amount_usd: float | None = None
    notes: str | None = None


@router.post("")
async def create_booking(
    body: CreateBookingRequest, current_user: CurrentUser = Depends(get_current_user)
) -> dict:
    supabase = get_user_scoped_supabase(current_user.access_token)

    tourist = supabase.table("tourists").select("id").eq("user_id", current_user.id).limit(1).execute()
    if not tourist.data:
        raise HTTPException(status_code=404, detail="No tourist profile found for this user")

    commission = (body.total_amount_usd or 0) * COMMISSION_RATE
    payload = {
        "tourist_id": tourist.data[0]["id"],
        "trip_id": body.trip_id,
        "guide_id": body.guide_id,
        "booking_type": body.booking_type,
        "start_date": body.start_date,
        "end_date": body.end_date,
        "total_amount_usd": body.total_amount_usd,
        "commission_usd": commission,
        "notes": body.notes,
        "status": "pending",
    }
    result = supabase.table("bookings").insert(payload).execute()
    return result.data[0]


@router.get("")
async def list_my_bookings(current_user: CurrentUser = Depends(get_current_user)) -> dict:
    # RLS scopes this to bookings where the caller is the tourist or guide
    # involved, so no explicit filter is needed here.
    supabase = get_user_scoped_supabase(current_user.access_token)
    result = supabase.table("bookings").select("*").order("created_at", desc=True).execute()
    return {"bookings": result.data or []}


@router.get("/{booking_id}")
async def get_booking(booking_id: str, current_user: CurrentUser = Depends(get_current_user)) -> dict:
    supabase = get_user_scoped_supabase(current_user.access_token)
    result = supabase.table("bookings").select("*").eq("id", booking_id).limit(1).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Booking not found")
    return result.data[0]


class UpdateBookingStatusRequest(BaseModel):
    status: str


@router.patch("/{booking_id}/status")
async def update_booking_status(
    booking_id: str, body: UpdateBookingStatusRequest, current_user: CurrentUser = Depends(get_current_user)
) -> dict:
    supabase = get_user_scoped_supabase(current_user.access_token)
    result = supabase.table("bookings").update({"status": body.status}).eq("id", booking_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Booking not found or not permitted")
    return result.data[0]
