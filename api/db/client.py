from functools import lru_cache

from supabase import Client, create_client

from config import settings


@lru_cache
def get_supabase() -> Client:
    """Anon-key client. Subject to RLS — use for any request scoped to a user."""
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)


@lru_cache
def get_admin_supabase() -> Client:
    """Service-role client. Bypasses RLS — server-side only, never exposed to a client-facing endpoint."""
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)


def get_user_scoped_supabase(access_token: str) -> Client:
    """Anon-key client with the caller's JWT attached to PostgREST requests,
    so `auth.uid()` resolves inside RLS policies and the user only ever sees
    what their own policies allow. Prefer this over get_admin_supabase() in
    any router handling a single user's request — RLS is the primary access
    control mechanism per the security spec, not a backstop.
    """
    client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
    client.postgrest.auth(access_token)
    return client
