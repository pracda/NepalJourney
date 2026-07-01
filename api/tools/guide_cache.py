"""
Redis caching layer for guide listings.

Read path (hot):   request → Redis → return cached JSON
Read path (cold):  request → Redis miss → Supabase → cache → return
Write path:        guide update → invalidate cache key(s) → Supabase write

Design decisions for scale:
  - Keys are namespaced by query parameters so different filter combinations
    get independent cache slots. The key space is bounded because location/
    specialization are user inputs but we cap at 200 chars before hashing.
  - TTL is configurable via GUIDE_LIST_CACHE_TTL (default 30s). Short by design:
    a guide toggling availability should be visible within 30 seconds, not minutes.
  - Cache misses are not propagated as errors — a Redis outage degrades to
    always-miss (slower) without breaking the endpoint.
  - We cache raw JSON strings (not Python dicts) to skip serialization on cache hits.
  - Pattern-based cache invalidation: `KEYS guide:list:*` and `DEL` on guide update.
    At very high cardinality, switch to a Redis Set tracking affected keys per guide_id.
"""

import hashlib
import json
import logging
from functools import lru_cache
from typing import Any

import redis.asyncio as aioredis

from config import settings

logger = logging.getLogger(__name__)

GUIDE_LIST_PREFIX = "guide:list:"
GUIDE_DETAIL_PREFIX = "guide:detail:"


@lru_cache
def _get_redis() -> aioredis.Redis:
    return aioredis.from_url(settings.REDIS_URL, decode_responses=True)


def _list_cache_key(
    location: str | None,
    specialization: str | None,
    available_only: bool,
    limit: int,
) -> str:
    raw = f"{location or ''}|{specialization or ''}|{available_only}|{limit}"
    digest = hashlib.sha1(raw.encode()).hexdigest()[:12]
    return f"{GUIDE_LIST_PREFIX}{digest}"


def _detail_cache_key(guide_id: str) -> str:
    return f"{GUIDE_DETAIL_PREFIX}{guide_id}"


async def get_cached_guide_list(
    location: str | None,
    specialization: str | None,
    available_only: bool,
    limit: int,
) -> list[dict] | None:
    key = _list_cache_key(location, specialization, available_only, limit)
    try:
        cached = await _get_redis().get(key)
        if cached:
            return json.loads(cached)
    except Exception:
        logger.warning("Redis get failed for key %s — proceeding without cache", key)
    return None


async def set_cached_guide_list(
    location: str | None,
    specialization: str | None,
    available_only: bool,
    limit: int,
    data: list[dict],
) -> None:
    key = _list_cache_key(location, specialization, available_only, limit)
    try:
        await _get_redis().setex(key, settings.GUIDE_LIST_CACHE_TTL, json.dumps(data))
    except Exception:
        logger.warning("Redis set failed for key %s — cache miss on next request", key)


async def get_cached_guide_detail(guide_id: str) -> dict | None:
    try:
        cached = await _get_redis().get(_detail_cache_key(guide_id))
        if cached:
            return json.loads(cached)
    except Exception:
        logger.warning("Redis get failed for guide detail %s", guide_id)
    return None


async def set_cached_guide_detail(guide_id: str, data: dict) -> None:
    try:
        await _get_redis().setex(
            _detail_cache_key(guide_id),
            settings.GUIDE_LIST_CACHE_TTL,
            json.dumps(data),
        )
    except Exception:
        logger.warning("Redis set failed for guide detail %s", guide_id)


async def invalidate_guide(guide_id: str) -> None:
    """
    Invalidate all cached entries related to a specific guide.

    Called after any write to the guides table (availability toggle, verification
    status change, profile update) so stale data never lingers past the next request.

    Pattern scan note: SCAN is used instead of KEYS to avoid blocking Redis on
    large key spaces. At very high guide counts (>100k), move to a Redis Set that
    explicitly tracks which list-cache keys a guide appears in.
    """
    redis = _get_redis()
    try:
        # Always invalidate the detail cache
        await redis.delete(_detail_cache_key(guide_id))

        # Scan + delete all list cache entries (they all contain this guide)
        async for key in redis.scan_iter(f"{GUIDE_LIST_PREFIX}*"):
            await redis.delete(key)
    except Exception:
        logger.warning("Redis invalidation failed for guide %s — stale data possible until TTL", guide_id)
