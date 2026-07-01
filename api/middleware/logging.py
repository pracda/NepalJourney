"""
Structured access-log middleware.

Emits one JSON log line per request containing:
  - request_id (for cross-service correlation)
  - method, path, status_code, duration_ms
  - client IP (x-forwarded-for aware, for load-balanced deployments)

At scale these lines go to a log aggregation service (Datadog, Loki, CloudWatch).
The structlog library is already in pyproject.toml; this wires it to each request.

Excludes /health from logging to avoid log spam from load-balancer probes.
"""

import time

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from middleware.request_id import get_request_id

logger = structlog.get_logger(__name__)

SILENT_PATHS = {"/health", "/docs", "/redoc", "/openapi.json"}


class AccessLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        if request.url.path in SILENT_PATHS:
            return await call_next(request)

        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start) * 1000, 2)

        # X-Forwarded-For is set by nginx/Cloudflare in production
        client_ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown")

        logger.info(
            "request",
            request_id=get_request_id(),
            method=request.method,
            path=request.url.path,
            status=response.status_code,
            duration_ms=duration_ms,
            client_ip=client_ip,
        )
        return response
