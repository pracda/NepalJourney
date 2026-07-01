"""
Nepal Journey AI — FastAPI application entry point.

Middleware stack (applied bottom-up, i.e. outermost first):
  1. RequestIDMiddleware   — assigns X-Request-ID to every request for tracing
  2. AccessLogMiddleware   — structured JSON log line per request with duration
  3. RateLimitMiddleware   — Redis-backed per-IP rate limiting (AI endpoints stricter)
  4. CORSMiddleware        — browser cross-origin access control

Security invariants:
  - The service-role Supabase key is never returned to the client.
  - RLS is the primary data isolation layer; role checks at the router level
    are a defense-in-depth secondary layer (see routers/admin.py).
  - Sentry is initialized before the app object so it captures startup errors too.
  - Docs endpoints (/docs, /redoc, /openapi.json) are disabled in production
    so the API surface is not publicly enumerable.

Scalability notes:
  - All routers are stateless. State lives in Supabase (persistent) or Redis
    (ephemeral cache). Any number of API instances can run behind a load balancer.
  - The /health endpoint probes Redis and Supabase so the load balancer can
    pull a failing instance out of rotation before users see errors.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from middleware.access_log import AccessLogMiddleware
from middleware.rate_limit import RateLimitMiddleware
from middleware.request_id import RequestIDMiddleware
from routers import admin, auth, bookings, chat, guides, tracking, translate

if settings.SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration

    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        integrations=[FastApiIntegration()],
        traces_sample_rate=0.1,
    )

app = FastAPI(
    title="Nepal Journey AI API",
    description=(
        "AI agent orchestration, bookings, tracking, and government dashboard data "
        "for the Nepal Journey AI platform."
    ),
    version="0.2.0",
    docs_url="/docs" if settings.ENV != "production" else None,
    redoc_url="/redoc" if settings.ENV != "production" else None,
)

# ─── Middleware ───────────────────────────────────────────────────────────────
# FastAPI applies add_middleware in reverse order — last added runs outermost.
# We want: RequestID (outermost) → AccessLog → RateLimit → CORS (innermost).
# So add them in reverse: CORS first, RequestID last.

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "X-Request-ID"],
    expose_headers=["X-Request-ID"],
)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(AccessLogMiddleware)
app.add_middleware(RequestIDMiddleware)

# ─── Routers ──────────────────────────────────────────────────────────────────

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(chat.router, prefix="/chat", tags=["chat"])
app.include_router(guides.router, prefix="/guides", tags=["guides"])
app.include_router(bookings.router, prefix="/bookings", tags=["bookings"])
app.include_router(tracking.router, prefix="/tracking", tags=["tracking"])
app.include_router(translate.router, prefix="/translate", tags=["translate"])
app.include_router(admin.router, prefix="/admin", tags=["admin"])

# ─── Health check ─────────────────────────────────────────────────────────────

@app.get("/health", tags=["meta"])
async def health() -> dict:
    """
    Liveness + readiness probe.

    Returns detailed connectivity status so the load balancer (and on-call team)
    can distinguish a healthy instance from one with a broken Redis or Supabase
    connection. HTTP 200 is returned even for degraded state so the LB does not
    immediately drop the instance — use the 'degraded' field to trigger alerts.

    Failure modes handled:
      - Redis unreachable: guides cache degrades to cache-miss-only (slower but functional)
      - Supabase unreachable: all data endpoints fail (instance should be pulled)
    """
    import asyncio
    import time

    checks: dict[str, str] = {}
    degraded = False

    # ── Redis probe ───────────────────────────────────────────────────────────
    try:
        from tools.guide_cache import _get_redis
        redis = _get_redis()
        start = time.monotonic()
        await asyncio.wait_for(redis.ping(), timeout=2.0)
        checks["redis"] = f"ok ({int((time.monotonic() - start) * 1000)}ms)"
    except Exception as exc:
        checks["redis"] = f"error: {exc}"
        degraded = True

    # ── Supabase probe ────────────────────────────────────────────────────────
    try:
        from db.client import get_admin_supabase
        supabase = get_admin_supabase()
        start = time.monotonic()
        # Lightweight query — count rows in a tiny system table
        supabase.table("users").select("id", count="exact").limit(0).execute()
        checks["supabase"] = f"ok ({int((time.monotonic() - start) * 1000)}ms)"
    except Exception as exc:
        checks["supabase"] = f"error: {exc}"
        degraded = True

    return {
        "status": "degraded" if degraded else "ok",
        "env": settings.ENV,
        "checks": checks,
    }
