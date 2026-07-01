-- Migration 002: Auth triggers
-- Automatically creates public.users, public.guides, and public.tourists rows
-- when a new user signs up via Supabase Auth.
--
-- These fire on INSERT to auth.users (managed by Supabase Auth).
-- The role is read from raw_user_meta_data->>'role' which is set during signup
-- via supabase.auth.signUp({ options: { data: { role: 'guide' } } }).

-- ─── Function: sync new auth user to public.users ─────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role user_role;
BEGIN
  -- Safely coerce the role string; default to 'tourist' for unknown values
  BEGIN
    v_role := (NEW.raw_user_meta_data->>'role')::user_role;
  EXCEPTION WHEN invalid_text_representation THEN
    v_role := 'tourist';
  END;

  IF v_role IS NULL THEN
    v_role := 'tourist';
  END IF;

  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    v_role
  )
  ON CONFLICT (id) DO NOTHING;

  -- Create the role-specific profile row
  IF v_role = 'tourist' THEN
    INSERT INTO public.tourists (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;

  ELSIF v_role = 'guide' THEN
    -- Placeholder guide row — Yatra fills in the real data during registration
    INSERT INTO public.guides (user_id, name, location, experience_years, languages, daily_rate_usd, phone)
    VALUES (NEW.id, '', '', 0, '{}', 0, '')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- ─── Trigger on auth.users ────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── Add unique constraint on guides.user_id (needed for ON CONFLICT) ────────

ALTER TABLE public.guides
  ADD CONSTRAINT guides_user_id_key UNIQUE (user_id);

ALTER TABLE public.tourists
  ADD CONSTRAINT tourists_user_id_key UNIQUE (user_id);
