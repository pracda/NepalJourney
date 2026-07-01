"""
Yatra chat endpoints.

Security notes:
  - All endpoints require a valid JWT. guide_id is resolved from the token's
    sub claim via _guide_id_for_user — the client never supplies their own guide_id.
  - Session ownership is verified on every call: the session's guide_id must
    match the authenticated user's guide_id. This prevents one guide from reading
    or injecting messages into another guide's session.
  - greet is idempotent: calling it N times with the same session_id returns the
    current state without resetting it (critical for app-restart session recovery).

Scalability notes:
  - LLM calls inside yatra.chat_with_guide are wrapped by the llm_retry circuit
    breaker in agents/yatra.py. Rate limiting on /chat/* is enforced upstream
    by RateLimitMiddleware (AI_RATE_LIMIT_REQUESTS_PER_MINUTE).
"""

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from agents import yatra
from db.client import get_admin_supabase
from middleware.request_id import get_request_id
from routers.auth import CurrentUser, get_current_user

logger = structlog.get_logger(__name__)
router = APIRouter()


def _guide_id_for_user(user_id: str) -> str:
    """Resolve the guide row ID for the authenticated user. Raises 404 if not found."""
    supabase = get_admin_supabase()
    result = supabase.table("guides").select("id").eq("user_id", user_id).limit(1).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="No guide profile found for this user")
    return result.data[0]["id"]


def _verify_session_ownership(session_id: str, guide_id: str) -> None:
    """
    Raise 403 if session_id is already associated with a different guide.

    A session that doesn't exist yet is allowed through — it will be created by
    the first greet call. A session that exists must belong to this guide.
    """
    supabase = get_admin_supabase()
    result = (
        supabase.table("yatra_sessions")
        .select("guide_id")
        .eq("session_id", session_id)
        .limit(1)
        .execute()
    )
    if result.data and result.data[0]["guide_id"] != guide_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Session does not belong to this guide",
        )


class GreetRequest(BaseModel):
    session_id: str | None = None


class ChatRequest(BaseModel):
    session_id: str
    message: str


@router.post("/yatra/greet")
async def yatra_greet(
    body: GreetRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """
    Start or resume a Yatra session.

    Idempotent: if session_id already exists for this guide, returns current
    state without re-running the greeting node. The client calls this on every
    app launch to recover an in-progress registration session after a restart.
    """
    guide_id = _guide_id_for_user(current_user.id)
    if body.session_id:
        _verify_session_ownership(body.session_id, guide_id)

    result = await yatra.greet_guide(guide_id, body.session_id)
    logger.info(
        "yatra_greet",
        request_id=get_request_id(),
        guide_id=guide_id,
        session_id=result.get("session_id"),
        is_resume=bool(body.session_id),
    )
    return result


@router.post("/yatra")
async def yatra_chat(
    body: ChatRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    guide_id = _guide_id_for_user(current_user.id)
    _verify_session_ownership(body.session_id, guide_id)

    result = await yatra.chat_with_guide(guide_id, body.session_id, body.message)
    logger.info(
        "yatra_chat",
        request_id=get_request_id(),
        guide_id=guide_id,
        session_id=body.session_id,
        node=result.get("current_node"),
        registration_complete=result.get("registration_complete"),
    )
    return result


@router.get("/yatra/{session_id}/history")
async def yatra_history(
    session_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    guide_id = _guide_id_for_user(current_user.id)
    _verify_session_ownership(session_id, guide_id)
    history = await yatra.get_session_history(session_id)
    return {"session_id": session_id, "messages": history}
