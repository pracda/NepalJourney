"""Nepal Tourism Board license verification.

There is no public NTB verification API today, so this queues a row in
`verification_jobs` for manual review (Phase 1 stand-in). The interface
is written as if a real NTB API exists so swapping in one later only
touches `process_verification_job`, not any caller.
"""

from db.client import get_admin_supabase


async def queue_ntb_verification(guide_id: str, license_number: str) -> str:
    """Queue a verification job for a guide's NTB license. Returns the job id."""
    supabase = get_admin_supabase()
    result = (
        supabase.table("verification_jobs")
        .insert({"guide_id": guide_id, "license_number": license_number, "status": "queued"})
        .execute()
    )
    return result.data[0]["id"]


async def process_verification_job(job_id: str) -> dict:
    """Stand-in for a background worker. Phase 1: marks queued -> processing
    and leaves the rest to manual admin review via the admin dashboard.
    Replace the body with a real NTB API call when one becomes available.
    """
    supabase = get_admin_supabase()
    supabase.table("verification_jobs").update({"status": "processing"}).eq("id", job_id).execute()
    return {"job_id": job_id, "status": "processing"}
