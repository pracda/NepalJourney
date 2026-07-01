"""
Expo Push Notification sender.

Design:
  - Expo's Push API accepts batches of up to 100 messages. We send individual
    notifications here but batch within a single user's devices so one DB lookup
    serves all their tokens.
  - Tokens are fetched from push_tokens using the admin client (service-role)
    so RLS doesn't restrict the lookup — the sender needs all tokens for a user
    regardless of who is making the API call.
  - Invalid / expired tokens returned by Expo (DeviceNotRegistered, InvalidCredentials)
    are deleted from push_tokens immediately to keep the table clean.
  - Fire-and-forget: callers use fire_and_forget() from tools/email.py — a failed
    push must never block or roll back a booking status change.
  - In dev (no EXPO_PUSH_TOKEN or request fails), logs to stdout only.

Scalability note:
  At high volume, batch sends across all users in a single HTTP call to Expo's API
  (up to 100 messages per request). Expo recommends chunked batching over one-at-a-time.
  The current implementation is correct but not maximally efficient — acceptable for
  the early growth phase.
"""

import logging

import httpx

from config import settings
from db.client import get_admin_supabase

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

# ─── Token helpers ────────────────────────────────────────────────────────────

def get_user_push_tokens(user_id: str) -> list[str]:
    """Return all Expo push tokens registered for a user."""
    supabase = get_admin_supabase()
    result = (
        supabase.table("push_tokens")
        .select("token")
        .eq("user_id", user_id)
        .execute()
    )
    return [row["token"] for row in (result.data or [])]


def delete_push_token(token: str) -> None:
    """Remove a token that Expo has told us is no longer valid."""
    try:
        get_admin_supabase().table("push_tokens").delete().eq("token", token).execute()
    except Exception:
        logger.warning("Failed to delete stale push token: %s", token[:20])


def upsert_push_token(user_id: str, token: str, platform: str) -> None:
    """Register or refresh a push token. Called on every app launch."""
    get_admin_supabase().table("push_tokens").upsert(
        {"user_id": user_id, "token": token, "platform": platform},
        on_conflict="user_id,token",
    ).execute()


# ─── Core send function ───────────────────────────────────────────────────────

async def _send_to_token(token: str, title: str, body: str, data: dict | None) -> None:
    payload = {
        "to": token,
        "title": title,
        "body": body,
        "sound": "default",
        "data": data or {},
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(EXPO_PUSH_URL, json=payload)
            if resp.status_code != 200:
                logger.error("Expo push API returned %s for token %s", resp.status_code, token[:20])
                return

            result = resp.json()
            # Expo returns per-message status in data[0]
            for ticket in result.get("data", []):
                if ticket.get("status") == "error":
                    details = ticket.get("details", {})
                    error_code = details.get("error")
                    logger.warning("Expo push error '%s' for token %s", error_code, token[:20])
                    if error_code in ("DeviceNotRegistered", "InvalidCredentials"):
                        delete_push_token(token)
    except Exception:
        logger.exception("Failed to send push notification to token %s", token[:20])


async def notify_user(
    user_id: str,
    title: str,
    body: str,
    data: dict | None = None,
) -> None:
    """
    Send a push notification to all devices registered for user_id.
    Silently skips if the user has no tokens registered.
    """
    tokens = get_user_push_tokens(user_id)
    if not tokens:
        logger.debug("No push tokens for user %s — skipping notification", user_id)
        return

    for token in tokens:
        await _send_to_token(token, title, body, data)


# ─── Booking-specific notifications ──────────────────────────────────────────

async def notify_guide_new_booking(guide_user_id: str, tourist_name: str, start_date: str, booking_id: str) -> None:
    await notify_user(
        guide_user_id,
        title="New Booking Request",
        body=f"{tourist_name} wants to book you starting {start_date}",
        data={"type": "booking_request", "booking_id": booking_id},
    )


async def notify_tourist_booking_confirmed(tourist_user_id: str, guide_name: str, booking_id: str) -> None:
    await notify_user(
        tourist_user_id,
        title="Booking Confirmed!",
        body=f"{guide_name} confirmed your booking. You're all set!",
        data={"type": "booking_confirmed", "booking_id": booking_id},
    )


async def notify_tourist_booking_cancelled(tourist_user_id: str, guide_name: str, booking_id: str) -> None:
    await notify_user(
        tourist_user_id,
        title="Booking Cancelled",
        body=f"Your booking with {guide_name} was cancelled.",
        data={"type": "booking_cancelled", "booking_id": booking_id},
    )


async def notify_guide_booking_cancelled(guide_user_id: str, tourist_name: str, booking_id: str) -> None:
    await notify_user(
        guide_user_id,
        title="Booking Cancelled",
        body=f"{tourist_name} cancelled their booking.",
        data={"type": "booking_cancelled", "booking_id": booking_id},
    )
