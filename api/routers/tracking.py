from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from db.client import get_user_scoped_supabase
from routers.auth import CurrentUser, get_current_user
from tools.sos_dispatch import trigger_sos

router = APIRouter()


def _tourist_id_for_user(supabase, user_id: str) -> str:
    result = supabase.table("tourists").select("id, tracking_consent").eq("user_id", user_id).limit(1).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="No tourist profile found for this user")
    return result.data[0]


class GpsPointRequest(BaseModel):
    latitude: float
    longitude: float
    altitude_meters: float | None = None
    accuracy_meters: float | None = None
    trip_id: str | None = None
    recorded_at: str | None = None  # ISO timestamp; lets offline-queued points report when they actually happened


@router.post("/gps")
async def ingest_gps_point(body: GpsPointRequest, current_user: CurrentUser = Depends(get_current_user)) -> dict:
    supabase = get_user_scoped_supabase(current_user.access_token)
    tourist = _tourist_id_for_user(supabase, current_user.id)

    if not tourist.get("tracking_consent"):
        raise HTTPException(status_code=403, detail="Tracking consent not granted for this tourist")

    payload = {
        "tourist_id": tourist["id"],
        "trip_id": body.trip_id,
        "location": f"POINT({body.longitude} {body.latitude})",
        "altitude_meters": body.altitude_meters,
        "accuracy_meters": body.accuracy_meters,
    }
    if body.recorded_at:
        payload["recorded_at"] = body.recorded_at

    result = supabase.table("gps_tracks").insert(payload).execute()

    supabase.table("tourists").update(
        {
            "last_known_location": f"POINT({body.longitude} {body.latitude})",
            "last_known_location_at": "now()",
        }
    ).eq("id", tourist["id"]).execute()

    return result.data[0]


@router.post("/gps/batch")
async def ingest_gps_batch(
    points: list[GpsPointRequest], current_user: CurrentUser = Depends(get_current_user)
) -> dict:
    """Bulk endpoint for the mobile offline queue to flush on reconnect."""
    supabase = get_user_scoped_supabase(current_user.access_token)
    tourist = _tourist_id_for_user(supabase, current_user.id)

    if not tourist.get("tracking_consent"):
        raise HTTPException(status_code=403, detail="Tracking consent not granted for this tourist")

    rows = [
        {
            "tourist_id": tourist["id"],
            "trip_id": p.trip_id,
            "location": f"POINT({p.longitude} {p.latitude})",
            "altitude_meters": p.altitude_meters,
            "accuracy_meters": p.accuracy_meters,
            **({"recorded_at": p.recorded_at} if p.recorded_at else {}),
        }
        for p in points
    ]
    result = supabase.table("gps_tracks").insert(rows).execute()
    return {"inserted": len(result.data or [])}


class SosRequest(BaseModel):
    latitude: float | None = None
    longitude: float | None = None
    altitude_meters: float | None = None
    message: str | None = None


@router.post("/sos")
async def raise_sos(body: SosRequest, current_user: CurrentUser = Depends(get_current_user)) -> dict:
    supabase = get_user_scoped_supabase(current_user.access_token)
    tourist = supabase.table("tourists").select("id").eq("user_id", current_user.id).limit(1).execute()
    guide = supabase.table("guides").select("id").eq("user_id", current_user.id).limit(1).execute()

    if not tourist.data and not guide.data:
        raise HTTPException(status_code=404, detail="No tourist or guide profile found for this user")

    alert = await trigger_sos(
        tourist_id=tourist.data[0]["id"] if tourist.data else None,
        guide_id=guide.data[0]["id"] if guide.data else None,
        latitude=body.latitude,
        longitude=body.longitude,
        altitude_meters=body.altitude_meters,
        message=body.message,
    )
    return alert


@router.get("/sos/active")
async def list_active_sos(current_user: CurrentUser = Depends(get_current_user)) -> dict:
    """Government/admin dashboard feed. RLS restricts non-admin/government
    callers to rows where they're the tourist or guide involved.
    """
    supabase = get_user_scoped_supabase(current_user.access_token)
    result = supabase.table("sos_alerts").select("*").eq("status", "active").execute()
    return {"alerts": result.data or []}
