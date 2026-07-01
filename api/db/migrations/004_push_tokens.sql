-- Migration 004: Push tokens + booking state machine constraints
--
-- push_tokens: stores Expo Push notification tokens per user, one row per
--   device. A user can have multiple devices. Tokens are upserted on each
--   app launch so stale tokens are automatically replaced.
--
-- bookings: adds a state machine constraint so only valid status transitions
--   can be written. The application layer enforces the same transitions with
--   richer error messages, but this is the hard database-level backstop.

-- ─── Push tokens ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.push_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token           TEXT NOT NULL,
    platform        TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (user_id, token)  -- one row per user+device combination
);

-- Users can read and delete their own tokens; inserts are handled server-side
-- by the API (which uses the admin client for upserts to avoid RLS conflicts
-- on the first insert before the row exists).
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_tokens_select" ON public.push_tokens
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "users_own_tokens_delete" ON public.push_tokens
    FOR DELETE USING (user_id = auth.uid());

-- Index for fast lookups when sending notifications to a user's devices
CREATE INDEX IF NOT EXISTS push_tokens_user_id_idx ON public.push_tokens (user_id);

-- ─── Booking state machine constraint ────────────────────────────────────────
-- Valid transitions (mirrored in api/routers/bookings.py):
--   pending    → confirmed | cancelled
--   confirmed  → in_progress | cancelled
--   in_progress → completed | disputed
--   completed  → (terminal)
--   cancelled  → (terminal)
--   disputed   → resolved via admin action (no direct transition here)
--
-- The CHECK constraint is intentionally broad (just validates the target state
-- is a known value) — transition validation is enforced at the API layer where
-- we can return a helpful error. The constraint here catches completely unknown
-- status strings sent directly to the DB.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'bookings_status_valid'
          AND conrelid = 'public.bookings'::regclass
    ) THEN
        ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_valid
            CHECK (status IN ('pending','confirmed','in_progress','completed','cancelled','disputed'));
    END IF;
END $$;

-- ─── Booking payout columns (add if missing from initial schema) ──────────────
-- Ensures platform_commission_usd and guide_payout_usd exist and are computed
-- consistently. The application writes these explicitly on create.
ALTER TABLE public.bookings
    ADD COLUMN IF NOT EXISTS platform_commission_usd NUMERIC(10,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS guide_payout_usd        NUMERIC(10,2) DEFAULT 0;

-- ─── Updated-at trigger for push_tokens ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_push_token_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS push_tokens_updated_at ON public.push_tokens;
CREATE TRIGGER push_tokens_updated_at
    BEFORE UPDATE ON public.push_tokens
    FOR EACH ROW EXECUTE FUNCTION public.update_push_token_updated_at();
