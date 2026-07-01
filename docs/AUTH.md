# Authentication — Technical Documentation

Nepal Journey AI uses Supabase Auth for identity management across all three apps. This document covers the auth flow for each user type, token lifecycle, and how the FastAPI backend validates tokens.

---

## User Types and Signup Flows

### Tourist (`apps/mobile`)
1. Tourist opens the app → lands on the Welcome screen
2. Signs up with **email + OTP** (no password — reduces friction for travellers)
3. Supabase sends a 6-digit OTP to their email
4. On OTP verification, Supabase creates an `auth.users` row
5. A Postgres trigger (via Supabase's `auth.users` → `public.users` sync function) creates a `public.users` row with `role = 'tourist'`
6. A `public.tourists` row is created (via insert trigger on `users`)
7. Access token + refresh token are stored in `expo-secure-store`

### Guide (`apps/guide`)
1. Guide opens the app → lands on the Welcome screen
2. Signs up with email + OTP
3. On verification, `public.users` row created with `role = 'guide'`
4. A `public.guides` placeholder row is created (empty — Yatra will fill it during registration)
5. Guide is immediately routed to the Yatra ChatScreen to complete their profile

### NTB Admin (`apps/web`)
1. Admin navigates to `/login` on the web dashboard
2. Logs in with **email + password** (admins are pre-provisioned, not self-signup)
3. The API verifies `user_metadata.role == 'ntb_admin'` on the token
4. Admin is redirected to the dashboard

---

## Token Lifecycle

```
Supabase Auth
     │
     │ issues
     ▼
Access Token (JWT, 1h TTL)   +   Refresh Token (long-lived)
     │                               │
     │ stored in                     │ stored in
     ▼                               ▼
expo-secure-store              expo-secure-store
     │
     │ sent as
     ▼
Authorization: Bearer <token>
     │
     ▼
FastAPI (python-jose validates HS256 signature)
     │
     ▼
get_current_user() → CurrentUser(id, email, role, access_token)
     │
     │ access_token forwarded to
     ▼
get_user_scoped_supabase(access_token)
     │
     │ PostgREST header: Authorization: Bearer <token>
     ▼
Supabase RLS policies resolve auth.uid()
```

### Token Refresh
- Supabase JS SDK handles refresh automatically when the access token expires
- The refreshed token is stored back to `expo-secure-store`
- No user action required for seamless session continuation

---

## FastAPI Token Validation

Located in `api/routers/auth.py`:

```python
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)
) -> CurrentUser:
    token = credentials.credentials
    payload = jwt.decode(
        token,
        settings.JWT_SECRET,           # Supabase project JWT secret
        algorithms=[settings.JWT_ALGORITHM],  # HS256
        options={"verify_aud": False}  # Supabase tokens don't set aud
    )
    user_id = payload.get("sub")       # UUID — matches auth.users.id
    role = (
        payload.get("user_metadata", {}).get("role")
        or payload.get("app_metadata", {}).get("role")
        or payload.get("role", "tourist")
    )
    return CurrentUser(id=user_id, email=payload.get("email"), role=role, access_token=token)
```

**Why `verify_aud=False`?** Supabase JWTs don't include an `aud` claim by default. Enabling audience verification would cause all tokens to fail validation.

**Role resolution priority:**
1. `user_metadata.role` — set during signup via `options.data.role`
2. `app_metadata.role` — set by admin/server-side Supabase calls
3. `role` (top-level JWT claim) — fallback
4. `"tourist"` — safe default

---

## RLS Policy Map

Every protected endpoint uses `get_current_user()` to extract the user's ID and then creates a user-scoped Supabase client so RLS policies enforce data boundaries automatically.

| Table | Tourist can | Guide can | NTB Admin can |
|---|---|---|---|
| `users` | Read/update own row | Read/update own row | Read all |
| `guides` | Read verified/pending | Read/update own row | Read/update all |
| `tourists` | Read/update own row | Read tourist rows in their active bookings | Read all |
| `bookings` | Read/create own | Read bookings where guide_id = self | Read all |
| `reviews` | Read own, create on completed bookings | Read own | Read all |
| `gps_tracks` | Read/write own (if consent given) | Read tourist tracks in active booking | Read all |
| `sos_alerts` | Read/write own | Read/write own | Read all, update status |
| `complaints` | Read/create own | Read complaints about self | Read all, update status |
| `yatra_sessions` | — | Read/write own | Read all |

---

## Security Invariants

1. **No service-role key on client-facing endpoints.** Only `get_user_scoped_supabase()` (anon key + JWT) is used in request handlers. `get_admin_supabase()` (service-role) is only called from background tools (`ntb_verify.py`, `sos_dispatch.py`, `guide_match.py`).

2. **Role is not trusted from the token alone for authorization decisions.** Role is used for UI routing (which tab bar to show) but not for bypassing RLS — the database enforces boundaries regardless.

3. **JWT is validated on every request.** There is no session cache in the API. Each request independently validates the signature and expiry.

4. **Refresh tokens are stored in `expo-secure-store`**, not `AsyncStorage`. On iOS, Secure Store uses the Keychain (hardware-backed on devices with Secure Enclave). On Android, it uses EncryptedSharedPreferences backed by the Android Keystore.

---

## Environment Variables

| Variable | Used in | Purpose |
|---|---|---|
| `SUPABASE_URL` | API | PostgREST + Auth API base URL |
| `SUPABASE_ANON_KEY` | API | Anon-key client (subject to RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | API (admin tools only) | Bypasses RLS — never exposed to clients |
| `JWT_SECRET` | API | Supabase project JWT secret for token validation |
| `JWT_ALGORITHM` | API | `HS256` |
| `EXPO_PUBLIC_SUPABASE_URL` | Mobile apps | Supabase JS SDK init |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Mobile apps | Supabase JS SDK init (public, safe to expose) |
| `NEXT_PUBLIC_SUPABASE_URL` | Web dashboard | Supabase JS SDK init |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Web dashboard | Supabase JS SDK init |
