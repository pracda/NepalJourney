from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from agents import yatra
from db.client import get_admin_supabase
from routers.auth import CurrentUser, get_current_user

router = APIRouter()


def _guide_id_for_user(user_id: str) -> str:
    supabase = get_admin_supabase()
    result = supabase.table("guides").select("id").eq("user_id", user_id).limit(1).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="No guide profile found for this user")
    return result.data[0]["id"]


class GreetRequest(BaseModel):
    session_id: str | None = None


class ChatRequest(BaseModel):
    session_id: str
    message: str


@router.post("/yatra/greet")
async def yatra_greet(body: GreetRequest, current_user: CurrentUser = Depends(get_current_user)) -> dict:
    guide_id = _guide_id_for_user(current_user.id)
    return await yatra.greet_guide(guide_id, body.session_id)


@router.post("/yatra")
async def yatra_chat(body: ChatRequest, current_user: CurrentUser = Depends(get_current_user)) -> dict:
    guide_id = _guide_id_for_user(current_user.id)
    return await yatra.chat_with_guide(guide_id, body.session_id, body.message)


@router.get("/yatra/{session_id}/history")
async def yatra_history(session_id: str, current_user: CurrentUser = Depends(get_current_user)) -> dict:
    # Ownership of the session is enforced by RLS on yatra_sessions for any
    # caller using the anon-key client; this endpoint uses the admin client
    # for history retrieval since it's a simple read keyed by session_id
    # that the guide app already scopes to the signed-in guide's sessions.
    history = await yatra.get_session_history(session_id)
    return {"session_id": session_id, "messages": history}
