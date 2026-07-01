"""
Request correlation ID middleware.

Every inbound request receives a unique X-Request-ID header (UUID v4).
If the caller supplies one, we honour it (useful for client-side retry tracing).
The ID is:
  - Added to the response headers so clients can correlate logs
  - Stored in a context variable so any code in the request chain can include
    it in log lines without threading the value through function arguments

At millions of requests/day this is the primary cross-service tracing primitive.
Wire it into any external calls (Anthropic, OpenAI, Supabase) as a header so
vendor support can locate a specific problematic request.
"""

import uuid
from contextvars import ContextVar

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

# Module-level ContextVar — accessible from any coroutine in the same async task
request_id_var: ContextVar[str] = ContextVar("request_id", default="")


def get_request_id() -> str:
    """Return the current request's correlation ID, or empty string outside a request."""
    return request_id_var.get()


class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        rid = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        token = request_id_var.set(rid)
        try:
            response = await call_next(request)
        finally:
            request_id_var.reset(token)

        response.headers["X-Request-ID"] = rid
        return response
