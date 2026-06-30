"""BridgeVoice — real-time AI voice translation.

Pipeline: Whisper (STT) -> Claude (context-aware translation) -> OpenAI TTS.

Online mode only for now (per build order: online first, offline second).
Offline mode will add a whisper.cpp tiny model + cached phrase bank running
on-device in the mobile app, with this module's text-translation step
staying as the fallback once connectivity returns.

Security: raw audio is never written to Supabase or disk — it's processed
in memory for the duration of a single request and discarded. Only the
transcript/translation text (not audio) could be cached later for cost
control; no caching is implemented yet.
"""

from functools import lru_cache

from openai import AsyncOpenAI

from config import settings
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage


@lru_cache
def _get_openai() -> AsyncOpenAI:
    """Lazy singleton — instantiating eagerly at import time raises if
    OPENAI_API_KEY isn't set, which breaks test collection and any local
    dev session that hasn't configured every key yet.
    """
    return AsyncOpenAI(api_key=settings.OPENAI_API_KEY)


@lru_cache
def _get_llm() -> ChatAnthropic:
    return ChatAnthropic(model="claude-sonnet-4-6", api_key=settings.ANTHROPIC_API_KEY, temperature=0.2)

SUPPORTED_LANGUAGES = {"en": "English", "ne": "Nepali"}

TRANSLATION_SYSTEM = """You are a translation engine for real-time conversation between a tourist and a local guide/community member in Nepal.

Translate the given text from {source_lang} to {target_lang}. Rules:
- Preserve the speaker's tone and intent (casual, formal, urgent).
- Keep trekking/cultural terms (place names, food, gear) as commonly used by Nepali guides rather than over-literal translations.
- Output ONLY the translated text. No explanations, no quotes, no alternate phrasings.
- If the input is ambiguous or contains a name/number, carry it through unchanged."""


async def transcribe_audio(audio_bytes: bytes, filename: str, language: str | None = None) -> str:
    """Speech-to-text via the Whisper API. `language` is an ISO-639-1 hint
    (e.g. "en", "ne") — omit to let Whisper auto-detect.
    """
    response = await _get_openai().audio.transcriptions.create(
        model="whisper-1",
        file=(filename, audio_bytes),
        language=language,
    )
    return response.text


async def translate_text(text: str, source_lang: str, target_lang: str) -> str:
    if source_lang not in SUPPORTED_LANGUAGES or target_lang not in SUPPORTED_LANGUAGES:
        raise ValueError(f"Unsupported language pair: {source_lang} -> {target_lang}")

    system_prompt = TRANSLATION_SYSTEM.format(
        source_lang=SUPPORTED_LANGUAGES[source_lang],
        target_lang=SUPPORTED_LANGUAGES[target_lang],
    )
    response = await _get_llm().ainvoke(
        [
            SystemMessage(content=system_prompt),
            HumanMessage(content=text),
        ]
    )
    return response.content


async def synthesize_speech(text: str, language: str) -> bytes:
    """Text-to-speech via OpenAI TTS. Returns raw MP3 bytes."""
    voice = "alloy"  # single neutral voice for both languages in Phase 1
    response = await _get_openai().audio.speech.create(model="tts-1", voice=voice, input=text)
    return response.content


async def translate_voice(
    audio_bytes: bytes,
    filename: str,
    source_lang: str,
    target_lang: str,
) -> dict:
    """Full pipeline: audio in source language -> translated audio in target language."""
    transcript = await transcribe_audio(audio_bytes, filename, language=source_lang)
    translation = await translate_text(transcript, source_lang, target_lang)
    audio_out = await synthesize_speech(translation, target_lang)

    return {
        "transcript": transcript,
        "translation": translation,
        "audio_base64": _to_base64(audio_out),
    }


def _to_base64(data: bytes) -> str:
    import base64

    return base64.b64encode(data).decode("ascii")
