from fastapi import APIRouter, Depends, HTTPException, Query

from db.client import get_user_scoped_supabase
from routers.auth import CurrentUser, get_current_user
from tools.guide_match import find_matching_guides

router = APIRouter()


@router.get("")
async def list_guides(
    location: str | None = None,
    specialization: str | None = None,
    available_only: bool = True,
    limit: int = Query(default=20, le=100),
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    supabase = get_user_scoped_supabase(current_user.access_token)
    query = supabase.table("guides").select(
        "id, name, location, specializations, languages, daily_rate_usd, "
        "tier, rating_avg, total_reviews, is_available, photo_url"
    )
    if location:
        query = query.ilike("location", f"%{location}%")
    if specialization:
        query = query.contains("specializations", [specialization])
    if available_only:
        query = query.eq("is_available", True)

    result = query.limit(limit).execute()
    return {"guides": result.data or []}


@router.get("/match")
async def match_guides(
    preferences: str = Query(..., description="Free-text description of what the tourist is looking for"),
    limit: int = Query(default=5, le=20),
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    matches = await find_matching_guides(preferences, limit)
    return {"guides": matches}


@router.get("/{guide_id}")
async def get_guide(guide_id: str, current_user: CurrentUser = Depends(get_current_user)) -> dict:
    supabase = get_user_scoped_supabase(current_user.access_token)
    result = supabase.table("guides").select("*").eq("id", guide_id).limit(1).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Guide not found")
    return result.data[0]
