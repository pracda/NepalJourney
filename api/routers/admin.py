"""
Admin-only endpoints for NTB/government operations.

Security invariants enforced here:
  1. Every endpoint requires a valid JWT with role == 'ntb_admin' or 'government'.
     Role is verified by require_admin_role() before any data access.
  2. Every mutating action writes an audit_log row BEFORE the main mutation.
     If the mutation fails, the audit row is still committed — this is intentional:
     it provides evidence that an attempt was made, even if it ultimately failed.
  3. Optimistic locking on guides.version prevents two admins from simultaneously
     approving/rejecting without seeing each other's change (returns 409 Conflict).
  4. Email notifications are fire-and-forget — a failed email must not cause the
     HTTP response to fail or roll back the database change.
  5. The admin Supabase client (service-role key) is used for mutations here because
     RLS write policies for admins are harder to maintain correctly than an explicit
     role check at the API layer. The trade-off is documented in ARCHITECTURE.md (ADR-019).
"""

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from db.client import get_admin_supabase
from routers.auth import CurrentUser, get_current_user
from tools.email import fire_and_forget, notify_guide_approved, notify_guide_rejected
from tools.guide_cache import invalidate_guide
from middleware.request_id import get_request_id

logger = structlog.get_logger(__name__)
router = APIRouter()

_ADMIN_ROLES = {"ntb_admin", "government"}


def require_admin_role(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """Dependency — raises 403 for non-admin callers."""
    if current_user.role not in _ADMIN_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This endpoint requires NTB admin or government role",
        )
    return current_user


# ─── Guide verification ───────────────────────────────────────────────────────

class VerifyGuideRequest(BaseModel):
    action: str                # "approve" | "reject"
    notes: str | None = None   # mandatory on rejection; optional on approval
    version: int               # optimistic lock — must match guides.version


@router.patch("/guides/{guide_id}/verify")
async def verify_guide(
    guide_id: str,
    body: VerifyGuideRequest,
    request: Request,
    admin: CurrentUser = Depends(require_admin_role),
) -> dict:
    """
    Approve or reject a guide's verification.

    Idempotency: if the guide is already in the target state, returns 200 without
    re-writing or re-sending the email (check happens after optimistic lock).

    Optimistic locking: the UPDATE includes WHERE version = body.version.
    If another admin acted first (version mismatch), returns 409 with the current state.
    """
    if body.action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="action must be 'approve' or 'reject'")

    if body.action == "reject" and not body.notes:
        raise HTTPException(status_code=400, detail="notes are required when rejecting a guide")

    supabase = get_admin_supabase()

    # ── Load current guide state ──────────────────────────────────────────────
    current = supabase.table("guides").select(
        "id, name, user_id, verification_status, tier, version"
    ).eq("id", guide_id).limit(1).execute()

    if not current.data:
        raise HTTPException(status_code=404, detail="Guide not found")

    guide = current.data[0]
    new_status = "verified" if body.action == "approve" else "rejected"

    # ── Idempotency: already in target state ──────────────────────────────────
    if guide["verification_status"] == new_status:
        return {"guide_id": guide_id, "verification_status": new_status, "message": "No change — already in target state"}

    # ── Write audit log BEFORE the mutation ───────────────────────────────────
    client_ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown")
    supabase.table("admin_audit_log").insert({
        "admin_user_id": admin.id,
        "action": f"{body.action}_guide",
        "target_type": "guide",
        "target_id": guide_id,
        "previous_value": {
            "verification_status": guide["verification_status"],
            "tier": guide["tier"],
            "version": guide["version"],
        },
        "new_value": {"verification_status": new_status},
        "notes": body.notes,
        "ip_address": client_ip,
    }).execute()

    # ── Optimistic-lock update ────────────────────────────────────────────────
    update_result = supabase.table("guides").update({
        "verification_status": new_status,
        "version": guide["version"] + 1,
    }).eq("id", guide_id).eq("version", body.version).execute()

    if not update_result.data:
        # Version mismatch — another admin acted concurrently
        fresh = supabase.table("guides").select("verification_status, version").eq("id", guide_id).limit(1).execute()
        current_state = fresh.data[0] if fresh.data else {}
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Guide was modified by another admin — please refresh and retry",
                "current_status": current_state.get("verification_status"),
                "current_version": current_state.get("version"),
            },
        )

    # ── Load guide owner's email for notification ─────────────────────────────
    user_row = supabase.table("users").select("email").eq("id", guide["user_id"]).limit(1).execute()
    guide_email = user_row.data[0]["email"] if user_row.data else None

    # ── Fire-and-forget email notification ───────────────────────────────────
    if guide_email:
        if body.action == "approve":
            fire_and_forget(notify_guide_approved(guide_email, guide["name"]))
        else:
            fire_and_forget(notify_guide_rejected(guide_email, guide["name"], body.notes))

    # ── Invalidate guide cache ────────────────────────────────────────────────
    await invalidate_guide(guide_id)

    logger.info(
        "guide_verified",
        request_id=get_request_id(),
        admin_id=admin.id,
        guide_id=guide_id,
        action=body.action,
        new_status=new_status,
    )

    return {
        "guide_id": guide_id,
        "verification_status": new_status,
        "version": guide["version"] + 1,
    }


# ─── Guide list for NTB review ────────────────────────────────────────────────

@router.get("/guides")
async def list_guides_for_review(
    verification_status: str | None = None,
    limit: int = 50,
    offset: int = 0,
    admin: CurrentUser = Depends(require_admin_role),
) -> dict:
    """
    Paginated guide list for the NTB dashboard.
    Uses the admin client to bypass RLS — returns all guides regardless of status.
    """
    supabase = get_admin_supabase()
    query = supabase.table("guides").select(
        "id, name, photo_url, location, experience_years, ntb_license_number, "
        "taan_member, first_aid_certified, languages, daily_rate_usd, "
        "verification_status, tier, rating, total_reviews, total_trips, "
        "is_available, created_at, version",
        count="exact",
    ).order("created_at", desc=True)

    if verification_status:
        query = query.eq("verification_status", verification_status)

    result = query.range(offset, offset + limit - 1).execute()

    return {
        "guides": result.data or [],
        "total": result.count or 0,
        "offset": offset,
        "limit": limit,
    }


@router.get("/guides/{guide_id}")
async def get_guide_detail_for_admin(
    guide_id: str,
    admin: CurrentUser = Depends(require_admin_role),
) -> dict:
    """Full guide detail including audit history, for the NTB review panel."""
    supabase = get_admin_supabase()

    guide_result = supabase.table("guides").select("*").eq("id", guide_id).limit(1).execute()
    if not guide_result.data:
        raise HTTPException(status_code=404, detail="Guide not found")

    # Last 10 audit log entries for this guide
    audit_result = supabase.table("admin_audit_log").select(
        "action, notes, previous_value, new_value, created_at, admin_user_id"
    ).eq("target_id", guide_id).order("created_at", desc=True).limit(10).execute()

    return {
        "guide": guide_result.data[0],
        "audit_history": audit_result.data or [],
    }


# ─── Audit log query ──────────────────────────────────────────────────────────

@router.get("/audit-log")
async def get_audit_log(
    target_type: str | None = None,
    limit: int = 100,
    offset: int = 0,
    admin: CurrentUser = Depends(require_admin_role),
) -> dict:
    """Return recent audit log entries for the NTB compliance view."""
    supabase = get_admin_supabase()
    query = supabase.table("admin_audit_log").select(
        "id, action, target_type, target_id, notes, ip_address, created_at, admin_user_id",
        count="exact",
    ).order("created_at", desc=True)

    if target_type:
        query = query.eq("target_type", target_type)

    result = query.range(offset, offset + limit - 1).execute()
    return {
        "entries": result.data or [],
        "total": result.count or 0,
    }
