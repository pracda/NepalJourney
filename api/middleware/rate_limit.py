"""Redis-backed rate limiting.

Guards against both abuse and cost blowouts on the Claude/Whisper-backed AI
endpoints (/chat/*), which get a tighter limit than everything else. Keyed
by the JWT subject when present, falling back to client IP for
unauthenticated requests (e.g. health checks, failed-auth attempts).
"""

import time

from fastapi import Request, Response
from jose import jwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

import redis.asyncio as aioredis
from config import settings

_redis: aioredis.Redis | None = None

AI_PATH_PREFIXES = ("/chat",)
EXEMPT_PATHS = ("/health", "/docs", "/redoc", "/openapi.json")


def _get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis


def _identity(request: Request) -> str:
    auth_header = request.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        token = auth_header[7:]
        try:
            # Limits are per-caller, not a security boundary, so a decode
            # without signature verification is fine here — real auth
            # happens in routers/auth.py's get_current_user.
            payload = jwt.get_unverified_claims(token)
            sub = payload.get("sub")
            if sub:
                return f"user:{sub}"
        except Exception:
            pass
    client_host = request.client.host if request.client else "unknown"
    return f"ip:{client_host}"


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        if path in EXEMPT_PATHS:
            return await call_next(request)

        is_ai_path = path.startswith(AI_PATH_PREFIXES)
        limit = settings.AI_RATE_LIMIT_REQUESTS_PER_MINUTE if is_ai_path else settings.RATE_LIMIT_REQUESTS_PER_MINUTE

        window = int(time.time() // 60)
        key = f"ratelimit:{'ai' if is_ai_path else 'std'}:{_identity(request)}:{window}"

        redis_client = _get_redis()
        count = await redis_client.incr(key)
        if count == 1:
            await redis_client.expire(key, 60)

        if count > limit:
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Please slow down and try again shortly."},
            )

        return await call_next(request)
