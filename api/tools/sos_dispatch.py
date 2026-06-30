"""SOS alert creation and dispatch.

Phase 1: writes the alert to `sos_alerts` (which the government dashboard
will poll/subscribe to via Supabase Realtime) and returns it. There is no
real emergency-services integration yet — that's a Phase 3 government
relationship item, not something this codebase can wire up unilaterally.
"""

from db.client import get_admin_supabase


async def trigger_sos(
    *,
    tourist_id: str | None = None,
    guide_id: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    altitude_meters: float | None = None,
    message: str | None = None,
) -> dict:
    if not tourist_id and not guide_id:
        raise ValueError("trigger_sos requires at least one of tourist_id or guide_id")

    supabase = get_admin_supabase()
    payload = {
        "tourist_id": tourist_id,
        "guide_id": guide_id,
        "altitude_meters": altitude_meters,
        "message": message,
        "status": "active",
    }
    if latitude is not None and longitude is not None:
        payload["location"] = f"POINT({longitude} {latitude})"

    result = supabase.table("sos_alerts").insert(payload).execute()
    return result.data[0]
