from fastapi import APIRouter, Depends, File, Form, UploadFile
from pydantic import BaseModel

from agents.translation import translate_text, translate_voice
from routers.auth import CurrentUser, get_current_user

router = APIRouter()


@router.post("/voice")
async def translate_voice_endpoint(
    audio: UploadFile = File(...),
    source_lang: str = Form(...),
    target_lang: str = Form(...),
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    audio_bytes = await audio.read()
    return await translate_voice(audio_bytes, audio.filename or "audio.webm", source_lang, target_lang)


class TranslateTextRequest(BaseModel):
    text: str
    source_lang: str
    target_lang: str


@router.post("/text")
async def translate_text_endpoint(
    body: TranslateTextRequest, current_user: CurrentUser = Depends(get_current_user)
) -> dict:
    translation = await translate_text(body.text, body.source_lang, body.target_lang)
    return {"translation": translation}
