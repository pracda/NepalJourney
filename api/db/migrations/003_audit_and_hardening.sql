-- Migration 003: Audit log + schema hardening for production scale
--
-- Design principles:
--   1. The audit_log is APPEND-ONLY — no UPDATE/DELETE RLS policies.
--      At millions of events/day this table is partitioned monthly.
--   2. All admin mutations (verify guide, resolve complaint, acknowledge SOS)
--      MUST produce an audit_log row — enforced at the API layer.
--   3. Optimistic locking on guides.verification_status via a version column
--      prevents two admins from simultaneously approving the same guide.
--   4. Idempotency keys on yatra_sessions prevent duplicate greet calls
--      from creating duplicate sessions under high concurrency.

-- ─── Audit log ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_audit_log (
    id              uuid        DEFAULT uuid_generate_v4() PRIMARY KEY,
    admin_user_id   uuid        REFERENCES public.users(id) ON DELETE SET NULL,
    action          text        NOT NULL,
    -- e.g. 'approve_guide', 'reject_guide', 'resolve_complaint',
    --      'acknowledge_sos', 'update_tier'
    target_type     text        NOT NULL,   -- 'guide', 'complaint', 'sos_alert', 'booking'
    target_id       uuid        NOT NULL,
    previous_value  jsonb,                  -- snapshot of changed fields before the action
    new_value       jsonb,                  -- snapshot of changed fields after the action
    notes           text,                   -- admin's free-text justification
    ip_address      inet,                   -- for compliance tracing
    created_at      timestamptz DEFAULT now() NOT NULL
) PARTITION BY RANGE (created_at);

-- Current month partition — add new ones monthly (or automate with pg_partman)
CREATE TABLE IF NOT EXISTS admin_audit_log_default
    PARTITION OF admin_audit_log DEFAULT;

-- Index for per-target lookups (guide history, complaint history)
CREATE INDEX IF NOT EXISTS audit_log_target_idx
    ON admin_audit_log (target_type, target_id);

-- Index for per-admin lookups (who did what)
CREATE INDEX IF NOT EXISTS audit_log_admin_idx
    ON admin_audit_log (admin_user_id, created_at DESC);

-- RLS: only ntb_admin/government can read; NOBODY can update or delete
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins can read audit log"
    ON admin_audit_log FOR SELECT
    USING (is_admin_or_government());

-- Intentionally no UPDATE or DELETE policy — the log is immutable by design.

-- ─── Optimistic locking on guides ────────────────────────────────────────────
-- Prevents two concurrent admin sessions from both approving/rejecting the
-- same guide without seeing each other's change.

ALTER TABLE public.guides
    ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- The API checks ?version=N in PATCH /admin/guides/:id/verify and the
-- UPDATE includes WHERE version = N, returning 0 rows if version has changed.

-- ─── Idempotency on yatra_sessions ───────────────────────────────────────────
-- The greet endpoint is safe to call multiple times with the same session_id;
-- the ON CONFLICT DO NOTHING in the upsert already handles this, but we add
-- a unique index for clarity and query planning.

-- (session_id is already the PK on yatra_sessions — no new index needed)

-- ─── Performance indexes for high-traffic read paths ─────────────────────────

-- Guide listings filtered by location (ilike scan)
CREATE INDEX IF NOT EXISTS guides_location_idx
    ON public.guides USING gin (location gin_trgm_ops);

-- Guide listings filtered by availability
CREATE INDEX IF NOT EXISTS guides_available_idx
    ON public.guides (is_available, verification_status)
    WHERE is_available = true;

-- Bookings by guide (earnings screen, dashboard)
CREATE INDEX IF NOT EXISTS bookings_guide_id_idx
    ON public.bookings (guide_id, created_at DESC);

-- Bookings by tourist (tourist booking history)
CREATE INDEX IF NOT EXISTS bookings_tourist_id_idx
    ON public.bookings (tourist_id, created_at DESC);

-- GPS tracks by tourist + time (live track replay)
CREATE INDEX IF NOT EXISTS gps_tracks_tourist_time_idx
    ON public.gps_tracks (tourist_id, recorded_at DESC);

-- SOS alerts by status (NTB dashboard SOS feed)
CREATE INDEX IF NOT EXISTS sos_alerts_status_idx
    ON public.sos_alerts (status, created_at DESC)
    WHERE status = 'active';

-- Complaints by guide (auto-escalation trigger + NTB review)
CREATE INDEX IF NOT EXISTS complaints_guide_status_idx
    ON public.complaints (reported_guide_id, status, created_at DESC);

-- ─── Enable pg_trgm for trigram (ilike) indexes ──────────────────────────────
-- Required for the gin_trgm_ops index above.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── Verification status index on guides ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS guides_verification_idx
    ON public.guides (verification_status, created_at DESC);
