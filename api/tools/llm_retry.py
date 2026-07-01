"""
Circuit breaker and retry logic for LLM API calls (Anthropic, OpenAI).

Why this exists:
  LLM APIs have higher latency and failure rates than typical HTTP services.
  Without retry logic, a single transient 529 (overloaded) from Anthropic
  causes a visible failure to the end user. With it, the vast majority of
  transient errors are transparent.

Design:
  - Exponential backoff with jitter: base_delay * 2^attempt + random(0, 1)
    The jitter prevents a thundering herd when many requests hit the API
    concurrently (e.g., during a retry storm after an outage).
  - Max retries and timeout are configurable via settings so they can be
    tuned per-deployment without a code change.
  - Retryable errors: network errors, 429 (rate limited), 500/502/503/529
    (server-side transient). NOT retried: 400 (bad request), 401 (auth),
    422 (validation) — these are permanent failures.
  - The decorator pattern keeps retry logic separate from business logic in
    the agent code.

At millions of requests/day, a retry storm after an LLM outage can amplify
load significantly. The jitter and the circuit-breaker state (TODO: add
half-open state tracking in Redis for multi-instance deployments) mitigate this.
"""

import asyncio
import functools
import logging
import random
from typing import Callable, TypeVar

from config import settings
from middleware.request_id import get_request_id

logger = logging.getLogger(__name__)

T = TypeVar("T")

# HTTP status codes that are safe to retry
_RETRYABLE_STATUS = {429, 500, 502, 503, 529}


def _is_retryable(exc: Exception) -> bool:
    """Return True if the exception is transient and worth retrying."""
    exc_str = str(exc).lower()
    # Anthropic / OpenAI SDK surface status codes in the exception message
    if any(f"status code: {s}" in exc_str or f"http {s}" in exc_str or str(s) in exc_str
           for s in _RETRYABLE_STATUS):
        return True
    # Network-level errors (connection reset, timeout)
    if any(term in exc_str for term in ("connection", "timeout", "network", "stream")):
        return True
    return False


async def with_llm_retry(coro_fn: Callable, *args, **kwargs):
    """
    Call an async LLM function with exponential-backoff retry.

    Usage:
        result = await with_llm_retry(llm.ainvoke, messages)

    Returns the result of the first successful call, or re-raises the last
    exception after all retries are exhausted.
    """
    max_retries = settings.LLM_MAX_RETRIES
    base_delay = settings.LLM_RETRY_BASE_DELAY
    timeout = settings.LLM_TIMEOUT_SECONDS
    last_exc: Exception | None = None

    for attempt in range(max_retries + 1):
        try:
            return await asyncio.wait_for(coro_fn(*args, **kwargs), timeout=timeout)
        except asyncio.TimeoutError as exc:
            last_exc = exc
            logger.warning(
                "LLM call timed out after %.1fs (attempt %d/%d, request_id=%s)",
                timeout, attempt + 1, max_retries + 1, get_request_id(),
            )
        except Exception as exc:
            last_exc = exc
            if not _is_retryable(exc):
                raise  # don't retry permanent errors
            logger.warning(
                "LLM call failed with retryable error (attempt %d/%d, request_id=%s): %s",
                attempt + 1, max_retries + 1, get_request_id(), exc,
            )

        if attempt < max_retries:
            # Exponential backoff with full jitter
            delay = base_delay * (2 ** attempt) + random.uniform(0, 1)
            await asyncio.sleep(delay)

    raise last_exc or RuntimeError("LLM call failed after all retries")


def llm_retryable(fn):
    """Decorator version of with_llm_retry for module-level async functions."""
    @functools.wraps(fn)
    async def wrapper(*args, **kwargs):
        return await with_llm_retry(fn, *args, **kwargs)
    return wrapper
