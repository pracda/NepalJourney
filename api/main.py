from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from middleware.rate_limit import RateLimitMiddleware
from routers import auth, bookings, chat, guides, tracking, translate

if settings.SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration

    sentry_sdk.init(dsn=settings.SENTRY_DSN, integrations=[FastApiIntegration()], traces_sample_rate=0.1)

app = FastAPI(
    title="Nepal Journey AI API",
    description="AI agent orchestration, bookings, tracking, and government dashboard data for the Nepal Journey AI platform.",
    version="0.1.0",
    docs_url="/docs" if settings.ENV != "production" else None,
    redoc_url="/redoc" if settings.ENV != "production" else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(RateLimitMiddleware)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(chat.router, prefix="/chat", tags=["chat"])
app.include_router(guides.router, prefix="/guides", tags=["guides"])
app.include_router(bookings.router, prefix="/bookings", tags=["bookings"])
app.include_router(tracking.router, prefix="/tracking", tags=["tracking"])
app.include_router(translate.router, prefix="/translate", tags=["translate"])


@app.get("/health", tags=["meta"])
async def health() -> dict:
    return {"status": "ok", "env": settings.ENV}
