# Guide Onboarding — Technical Reference

How a guide registers on Nepal Journey AI: the full lifecycle from app install to verified profile, with session persistence, agent state, and NTB approval.

---

## 1. Overview

Guide registration is a conversational flow managed by the **Yatra LangGraph agent**. The guide talks to Yatra in the Nepal Journey Guide app, and Yatra progressively extracts 12 profile fields over multiple turns. Once all fields are collected, Yatra submits the profile to Supabase. An NTB admin then reviews and verifies it in the NTB web dashboard.

```
Guide app          FastAPI / Yatra             Supabase             NTB Dashboard
    │                     │                       │                       │
    │─── POST /chat/yatra/greet ──────────────────▶│                       │
    │◀── {session_id, message: "Namaste!..."} ─────│                       │
    │                     │                       │                       │
    │─── POST /chat/yatra ─────────────────────────▶│                       │
    │◀── {message, fields, progress} ──────────────│                       │
    │    (repeat per turn)                         │                       │
    │                     │                       │                       │
    │                     │─── guides.upsert() ───▶│                       │
    │◀── {registration_complete: true} ────────────│                       │
    │                     │                       │                       │
    │                     │                       │◀─ GET /admin/guides ───│
    │                     │                       │─── guide row ─────────▶│
    │                     │                       │                       │
    │                     │                       │◀─ PATCH verify ────────│
    │                     │                       │   (approve/reject)     │
    │                     │◀─── email notify ──────│                       │
```

---

## 2. Session Lifecycle

### 2.1 Session creation

When the guide first opens the chat screen, `loadOrCreateSessionId()` in `ChatScreen.tsx` checks `expo-secure-store` for an existing `yatra_session_id`. If none exists, it generates a new UUID-like ID and persists it before calling greet.

```typescript
const SESSION_KEY = "yatra_session_id";

async function loadOrCreateSessionId(): Promise<string> {
  const stored = await SecureStore.getItemAsync(SESSION_KEY);
  if (stored) return stored;
  const fresh = `guide-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await SecureStore.setItemAsync(SESSION_KEY, fresh);
  return fresh;
}
```

**Why SecureStore?** On iOS this maps to the Keychain; on Android to the Android Keystore. The session ID itself is not sensitive (it's an opaque reference to server state), but storing it in SecureStore is consistent with the JWT storage pattern and avoids the plain-text `AsyncStorage`.

### 2.2 Greet call (idempotent)

The greet endpoint `POST /chat/yatra/greet` is called on every app mount with the stored session_id. The server's `greet_guide(guide_id, session_id)` function:

1. Checks `yatra_sessions` for an existing row with this `session_id`.
2. If found: loads the persisted `YatraState` and returns the current state — no new greeting is emitted.
3. If not found: creates a new session, runs the `node_greet` LangGraph node, persists state.

This means restarting the app mid-registration resumes exactly where the guide left off, not from scratch.

### 2.3 Session ownership enforcement

Every chat endpoint verifies session ownership:

```python
def _verify_session_ownership(session_id: str, guide_id: str) -> None:
    result = supabase.table("yatra_sessions")
                     .select("guide_id")
                     .eq("session_id", session_id)
                     .limit(1).execute()
    if result.data and result.data[0]["guide_id"] != guide_id:
        raise HTTPException(403, "Session does not belong to this guide")
```

Guide A cannot inject messages into Guide B's registration session, even if they somehow obtained Guide B's session_id.

### 2.4 Registration complete

When all 12 fields pass `node_is_complete()` checks, the graph transitions to `node_complete`, which:
1. Upserts the guide row in `public.guides` (verification_status = "pending").
2. Sets `registration_complete = True` in the session state.
3. Returns a congratulations message.

On the next app open, `greet` returns `registration_complete: true`. The chat screen detects this and shows a "Welcome back — registration complete" message instead of replaying the greeting.

---

## 3. Registration Fields

| Field | Node | Validation |
|---|---|---|
| `name` | `node_name` | Non-empty string |
| `location` | `node_location` | Non-empty string |
| `experience_years` | `node_experience` | Integer ≥ 0 |
| `specializations` | `node_specializations` | Non-empty list |
| `ntb_license_number` | `node_ntb_license` | String OR `has_ntb_license=False` |
| `taan_member` | `node_taan` | Boolean |
| `first_aid_certified` | `node_first_aid` | Boolean |
| `languages` | `node_languages` | Non-empty list |
| `daily_rate_usd` | `node_rate` | Float > 0 |
| `phone` | `node_phone` | Non-empty string |
| `photo_url` | `node_photo` | Non-empty string (URL) |
| `availability_start` | `node_availability` | ISO date string |

### NTB License special case

A guide without an NTB license is valid — they may operate under an agency license. Saying "I don't have one" sets `has_ntb_license = False`, which satisfies `node_is_complete(NTB_LICENSE)`. Without this, guides without licenses would be stuck in an infinite loop (see ADR-008).

---

## 4. NTB Verification Flow

### 4.1 Admin review

NTB admins log into `apps/web` at `/guides`. The page (`guides/page.tsx`) fetches all guides from `GET /admin/guides` using a server-side admin JWT. Guides can be filtered by `verification_status`.

### 4.2 Approve or reject

Clicking "Review →" on any guide opens `guides/[id]/page.tsx` which shows:
- Full profile details (all fields, NTB license, TAAN membership)
- `GuideVerificationPanel` — approve/reject buttons with a confirmation dialog
- Audit history — all prior admin actions on this guide

`GuideVerificationPanel` is a client component. On submission it calls:
```
PATCH /admin/guides/{guide_id}/verify
{ "action": "approve", "notes": "...", "version": 3 }
```

The `version` field is the optimistic lock — it must match `guides.version` in the database. If two admins try to act on the same guide simultaneously, the second request receives a 409 with the current state.

### 4.3 Email notification

Approval and rejection both trigger a fire-and-forget email via the Resend API:
- Approval: "Your profile has been approved — tourists can now find you"
- Rejection: "We could not approve your profile at this time" + admin's notes

The email is sent after the database mutation succeeds. A failed email does not roll back the approval; it is logged and may be retried manually.

### 4.4 Audit log

Every admin action writes a row to `admin_audit_log` **before** the main mutation:
```sql
INSERT INTO admin_audit_log
  (admin_user_id, action, target_type, target_id,
   previous_value, new_value, notes, ip_address)
VALUES (...);
```

The table has no UPDATE or DELETE RLS policy — rows are immutable once written. This gives NTB a tamper-evident record of every verification decision for compliance purposes.

---

## 5. Token Lifecycle

```
Guide opens app
    │
    ├── SecureStore.getItemAsync("supabase.session")
    │       └── Returns stored Supabase JWT (or null → redirect /auth/welcome)
    │
    ├── supabase.auth.onAuthStateChange
    │       └── Auto-refreshes token before expiry (handled by Supabase SDK)
    │
    ├── yatraGreet(session_id)
    │       └── Authorization: Bearer <access_token>
    │               └── FastAPI: verify JWT → extract sub (user_id) → lookup guide_id
    │                       └── Never trusts a client-supplied guide_id
    │
    └── yatraChat(session_id, message)
            └── Same flow; also verifies session ownership
```

The access token has a 1-hour TTL. `autoRefreshToken: true` in the Supabase client config handles silent refresh using the stored refresh token. The guide never needs to log in again unless they uninstall the app.

---

## 6. Security Invariants

1. **guide_id is never client-supplied.** All endpoints derive guide_id from the JWT's `sub` claim via a server-side DB lookup.
2. **Session ownership checked on every request.** A valid JWT for Guide A cannot access Guide B's session.
3. **Registration fields are server-extracted.** The client never sends structured field values — only raw message text. The LLM extracts fields server-side where the extraction prompt is controlled.
4. **Prompt injection mitigated.** User messages are wrapped in `<user_message>` XML tags with an explicit "untrusted data" instruction to the extraction prompt.
5. **Audit log is append-only.** No admin, including superadmins, can delete or modify a past audit entry through the API.
