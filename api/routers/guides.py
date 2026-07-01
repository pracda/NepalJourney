from fastapi import APIRouter, Depends, HTTPException, Query

from db.client import get_user_scoped_supabase
from routers.auth import CurrentUser, get_current_user
from tools.guide_match import find_matching_guides
from tools.guide_cache import (
    get_cached_guide_detail,
    get_cached_guide_list,
    set_cached_guide_detail,
    set_cached_guide_list,
)

router = APIRouter()

# Never expose the embedding vector on public endpoints
_PUBLIC_COLUMNS = (
    "id, name, photo_url, location, experience_years, specializations, "
    "languages, daily_rate_usd, tier, rating, total_reviews, "
    "is_available, verification_status"
)


@router.get("/me")
async def get_my_guide_profile(current_user: CurrentUser = Depends(get_current_user)) -> dict:
    """Return the guide profile belonging to the authenticated user."""
    supabase = get_user_scoped_supabase(current_user.access_token)
    result = (
        supabase.table("guides")
        .select("*")
        .eq("user_id", current_user.id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="No guide profile found for this user")
    return result.data[0]


@router.get("")
async def list_guides(
    location: str | None = None,
    specialization: str | None = None,
    available_only: bool = True,
    limit: int = Query(default=20, le=100),
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    # Cache-first: guide listing is the hottest read path
    cached = await get_cached_guide_list(location, specialization, available_only, limit)
    if cached is not None:
        return {"guides": cached, "cached": True}

    supabase = get_user_scoped_supabase(current_user.access_token)
    query = supabase.table("guides").select(_PUBLIC_COLUMNS)
    query = query.in_("verification_status", ["verified", "pending"])

    if location:
        query = query.ilike("location", f"%{location}%")
    if specialization:
        query = query.contains("specializations", [specialization])
    if available_only:
        query = query.eq("is_available", True)

    result = query.limit(limit).execute()
    guides = result.data or []

    await set_cached_guide_list(location, specialization, available_only, limit, guides)
    return {"guides": guides, "cached": False}


@router.get("/match")
async def match_guides(
    preferences: str = Query(..., description="Free-text description of what the tourist is looking for"),
    limit: int = Query(default=5, le=20),
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    matches = await find_matching_guides(preferences, limit)
    return {"guides": matches}


@router.get("/{guide_id}/reviews")
async def get_guide_reviews(
    guide_id: str,
    limit: int = Query(default=10, le=50),
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Recent public reviews for a guide, newest first."""
    supabase = get_user_scoped_supabase(current_user.access_token)
    result = (
        supabase.table("reviews")
        .select(
            "id, overall_rating, safety_rating, knowledge_rating, "
            "communication_rating, punctuality_rating, comment, created_at"
        )
        .eq("guide_id", guide_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return {"reviews": result.data or []}


@router.get("/{guide_id}")
async def get_guide(guide_id: str, current_user: CurrentUser = Depends(get_current_user)) -> dict:
    cached = await get_cached_guide_detail(guide_id)
    if cached is not None:
        return {**cached, "cached": True}

    supabase = get_user_scoped_supabase(current_user.access_token)
    result = (
        supabase.table("guides")
        .select(_PUBLIC_COLUMNS)
        .eq("id", guide_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Guide not found")

    guide = result.data[0]
    await set_cached_guide_detail(guide_id, guide)
    return guide
