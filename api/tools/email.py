"""
Email notification tool using Resend (https://resend.com).

Design decisions for scale and reliability:
  - Fire-and-forget pattern: the caller does not await delivery confirmation.
    Email failures are logged and reported to Sentry but never bubble up as
    HTTP errors to the user — a failed email must never block a guide approval.
  - In development (RESEND_API_KEY empty), emails are logged to stdout only.
  - Templates are plain text + HTML pairs kept in this module to avoid a
    template-loading step at startup. At higher volume, move to a proper
    template engine (Jinja2 already available) and cache compiled templates.
  - All calls are async so they don't block the event loop while waiting for
    the Resend HTTP response.
"""

import asyncio
import logging

import httpx

from config import settings
from middleware.request_id import get_request_id

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"

# ─── Email templates ──────────────────────────────────────────────────────────

def _guide_approved_body(guide_name: str) -> tuple[str, str]:
    """Returns (text, html) for a guide approval notification."""
    text = f"""Hi {guide_name},

Great news! Your Nepal Journey guide profile has been reviewed and approved by the Nepal Tourism Board.

Your profile is now visible to tourists planning treks and you'll start receiving booking requests.

Log in to the Nepal Journey Guide app to update your availability and manage bookings.

If you have any questions, reply to this email or contact {settings.GUIDE_SUPPORT_EMAIL}.

Safe trekking,
Nepal Journey Team
"""
    html = f"""<p>Hi <strong>{guide_name}</strong>,</p>
<p>Great news! Your Nepal Journey guide profile has been reviewed and <strong>approved</strong> by the Nepal Tourism Board.</p>
<p>Your profile is now visible to tourists planning treks and you'll start receiving booking requests.</p>
<p>Log in to the <strong>Nepal Journey Guide app</strong> to update your availability and manage bookings.</p>
<p>If you have any questions, reply to this email or contact <a href="mailto:{settings.GUIDE_SUPPORT_EMAIL}">{settings.GUIDE_SUPPORT_EMAIL}</a>.</p>
<p>Safe trekking,<br>Nepal Journey Team</p>"""
    return text, html


def _guide_rejected_body(guide_name: str, notes: str | None) -> tuple[str, str]:
    reason = notes or "Your application did not meet the current verification requirements."
    text = f"""Hi {guide_name},

Thank you for applying to become a verified guide on Nepal Journey.

After review by the Nepal Tourism Board, we were unable to approve your profile at this time.

Reason: {reason}

You can update your profile information and reapply at any time through the Nepal Journey Guide app.

If you believe this decision is incorrect or need clarification, please contact {settings.GUIDE_SUPPORT_EMAIL}.

Nepal Journey Team
"""
    html = f"""<p>Hi <strong>{guide_name}</strong>,</p>
<p>Thank you for applying to become a verified guide on Nepal Journey.</p>
<p>After review by the Nepal Tourism Board, we were unable to approve your profile at this time.</p>
<p><strong>Reason:</strong> {reason}</p>
<p>You can update your profile information and reapply at any time through the Nepal Journey Guide app.</p>
<p>If you believe this decision is incorrect, please contact <a href="mailto:{settings.GUIDE_SUPPORT_EMAIL}">{settings.GUIDE_SUPPORT_EMAIL}</a>.</p>
<p>Nepal Journey Team</p>"""
    return text, html


# ─── Core send function ───────────────────────────────────────────────────────

async def _send(to: str, subject: str, text: str, html: str) -> None:
    """
    Attempt to send an email via Resend. Logs failures; never raises.

    In dev (no RESEND_API_KEY), prints the email to stdout instead.
    This lets the dev loop work without configuring a real email provider.
    """
    if not settings.RESEND_API_KEY:
        logger.info(
            "DEV EMAIL (no RESEND_API_KEY set)\nTo: %s\nSubject: %s\n%s",
            to, subject, text,
        )
        return

    payload = {
        "from": settings.EMAIL_FROM,
        "to": [to],
        "subject": subject,
        "text": text,
        "html": html,
    }
    headers = {
        "Authorization": f"Bearer {settings.RESEND_API_KEY}",
        "Content-Type": "application/json",
        "X-Request-ID": get_request_id(),  # trace emails back to the originating API request
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(RESEND_API_URL, json=payload, headers=headers)
            if resp.status_code not in (200, 201):
                logger.error("Resend API error: %s — %s", resp.status_code, resp.text)
    except Exception:
        logger.exception("Failed to send email to %s (subject: %s)", to, subject)


# ─── Public helpers ───────────────────────────────────────────────────────────

async def notify_guide_approved(guide_email: str, guide_name: str) -> None:
    text, html = _guide_approved_body(guide_name)
    await _send(
        to=guide_email,
        subject="Your Nepal Journey guide profile has been approved",
        text=text,
        html=html,
    )


async def notify_guide_rejected(guide_email: str, guide_name: str, notes: str | None) -> None:
    text, html = _guide_rejected_body(guide_name, notes)
    await _send(
        to=guide_email,
        subject="Update on your Nepal Journey guide application",
        text=text,
        html=html,
    )


def fire_and_forget(coro) -> None:
    """
    Schedule a coroutine on the running event loop without awaiting it.

    Use for notifications where we want to return an HTTP response immediately
    and let the email send in the background. Errors are captured inside the
    coroutine itself (never propagate to the caller).
    """
    asyncio.get_event_loop().create_task(coro)
