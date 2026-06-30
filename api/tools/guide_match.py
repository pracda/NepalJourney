"""Guide <-> tourist matching via pgvector similarity search.

Guide profiles are embedded with OpenAI's text-embedding-3-small (1536-dim,
matches the `embedding vector(1536)` column on `guides`) so a tourist's
trip preferences can be matched against guide profiles with a cosine
similarity query instead of brittle keyword filters.
"""

from functools import lru_cache

from openai import AsyncOpenAI

from config import settings
from db.client import get_admin_supabase

EMBEDDING_MODEL = "text-embedding-3-small"


@lru_cache
def _get_client() -> AsyncOpenAI:
    """Lazy singleton — instantiating AsyncOpenAI eagerly at import time
    raises if OPENAI_API_KEY isn't set, which would break test collection
    and any local dev session that hasn't configured every key yet.
    """
    return AsyncOpenAI(api_key=settings.OPENAI_API_KEY)


def _guide_profile_text(fields: dict) -> str:
    parts = [
        fields.get("name", ""),
        fields.get("location", ""),
        f"{fields.get('experience_years', 0)} years experience",
        "Specializations: " + ", ".join(fields.get("specializations") or []),
        "Languages: " + ", ".join(fields.get("languages") or []),
    ]
    return " | ".join(p for p in parts if p)


async def generate_guide_embedding(guide_id: str, fields: dict) -> None:
    text = _guide_profile_text(fields)
    response = await _get_client().embeddings.create(model=EMBEDDING_MODEL, input=text)
    embedding = response.data[0].embedding

    supabase = get_admin_supabase()
    supabase.table("guides").update({"embedding": embedding}).eq("id", guide_id).execute()


async def find_matching_guides(preferences_text: str, limit: int = 5) -> list[dict]:
    """Embed a tourist's stated preferences and return the closest guides
    by cosine similarity. Requires the `match_guides` Postgres function
    (a thin wrapper around `<=>` ordering) — see db/migrations for pgvector
    setup; add that function in a follow-up migration once this is wired
    into the trip planner agent.
    """
    response = await _get_client().embeddings.create(model=EMBEDDING_MODEL, input=preferences_text)
    embedding = response.data[0].embedding

    supabase = get_admin_supabase()
    result = supabase.rpc(
        "match_guides", {"query_embedding": embedding, "match_count": limit}
    ).execute()
    return result.data or []
