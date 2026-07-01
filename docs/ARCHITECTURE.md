# Architecture Decision Record

This document records the significant design decisions made during Nepal Journey AI's development, with the reasoning behind each choice. Decisions are ordered by the stage in which they were made.

---

## Stage 0 — Foundation Decisions

### ADR-001: Monorepo with pnpm workspaces

**Decision:** Single repository with `apps/*` and `packages/*` using pnpm workspaces.

**Reasoning:** The three apps (guide, mobile, web) share types and config. A monorepo lets us ship type changes atomically without a publish-consume cycle. pnpm's symlink-based workspace resolution is faster than npm's and avoids hoisting footguns.

**Trade-off:** Larger clone. Mitigated by sparse-checkout if needed later.

---

### ADR-002: FastAPI (Python) for the backend

**Decision:** Python 3.11 + FastAPI + Poetry, not Node/TypeScript on the backend.

**Reasoning:** The AI/ML ecosystem (LangChain, LangGraph, NumPy, pgvector client libraries) has deeper, more mature Python support. Using Python avoids translating between two async paradigms for the same process.

**Trade-off:** Two languages in the repo. The `packages/types` package bridges this at the API boundary — TypeScript types are generated/maintained by hand against the Pydantic models.

---

### ADR-003: Supabase as the data layer

**Decision:** Supabase (managed Postgres 16 + Auth + Realtime + Storage) rather than a self-hosted Postgres + custom auth.

**Reasoning:**
- Auth with JWT issuance, refresh tokens, and OAuth providers out of the box — saves 2–3 weeks.
- Row-Level Security enforcement at the database level — security policies can't be accidentally bypassed by a new router that forgets to filter.
- PostgREST (auto-generated REST API) means the mobile apps can make RLS-scoped reads directly without hitting the FastAPI layer — important for read-heavy screens like the trek map.
- pgvector and PostGIS both available as extensions on Supabase Pro.

**Trade-off:** Vendor lock-in. The RLS-scoped client helper (`get_user_scoped_supabase`) is the only Supabase-specific code in the API core — migrating to a self-hosted Postgres + Keycloak stack would require replacing that helper and the auth router.

---

### ADR-004: Row-Level Security as primary access control

**Decision:** RLS policies enforce data access boundaries. The service-role key (which bypasses RLS) is used only in explicitly admin-flagged helpers and never in client-facing request paths.

**Reasoning:** Defense-in-depth. Even if a FastAPI router has a bug that doesn't check the current user's role, the database will still refuse to return or mutate data the user doesn't own. This is especially important for the three-sided platform where a guide must never see another guide's earnings or a tourist's GPS history without consent.

**Implementation:** `get_user_scoped_supabase(access_token)` creates an anon-key client with the caller's JWT attached to PostgREST headers, so `auth.uid()` resolves inside every policy. Admin-only operations use `get_admin_supabase()` (service-role key), documented with an explicit docstring warning.

---

### ADR-005: LangGraph for the Yatra agent

**Decision:** LangGraph `StateGraph` with typed `YatraState`, not a plain async state machine.

**Reasoning:**
- LangGraph provides a compiled, inspectable graph with clear node→edge semantics. The registration flow has genuine conditional branching (registration vs. operational phase; confirm vs. re-extract on corrections) that maps directly to `set_conditional_entry_point`.
- `StateGraph` carries typed state between nodes without thread-local or instance variables — safe for concurrent async requests.
- LangGraph's persistence interface (checkpointing) can replace the hand-rolled `yatra_sessions` upsert later with zero API change.

**Alternative considered:** Plain async functions with an explicit state dict passed through. Rejected because it diverges from the decided stack and loses the graph visualization and persistence benefits.

---

### ADR-006: pgvector for guide-tourist matching

**Decision:** Embed guide profiles with `text-embedding-3-small` (1536-dim) and store in a `vector(1536)` column with an HNSW index. Match tourists via cosine similarity through a `match_guides()` security-definer SQL function.

**Reasoning:** Keyword matching on specializations/location would miss semantic equivalence ("Himalaya" ≡ "high altitude" ≡ "EBC"). Embedding-based search captures this naturally. The HNSW index makes ANN search fast enough for real-time guide discovery without Pinecone or a separate vector DB.

**Security note:** The `match_guides()` function is `SECURITY DEFINER` so it can read embeddings regardless of the caller's RLS context, but it returns only the columns needed for matching (no private guide data). The calling code (FastAPI) applies RLS on subsequent detail fetches.

---

## Stage 1 — Agent Design Decisions

### ADR-007: Prompt injection defense in Yatra

**Decision:** Wrap user input in `<user_message>` XML tags in the extraction prompt, prepend explicit "treat as untrusted data" instructions, strip control characters, and cap input at 2000 chars.

**Reasoning:** Yatra processes free-text from guides during onboarding. A malicious input could attempt to hijack the JSON extraction output (e.g., `{"name": "inject", "role": "admin"}`). The XML wrapper plus the explicit instructions make Claude parse the tagged content as a data payload rather than as a prompt continuation.

**Known limitation:** Not a hard security boundary — a sufficiently creative injection might still alter the extracted JSON. Mitigated by validating extracted fields against expected types in `node_is_complete()` before acting on them.

---

### ADR-008: NTB license decline flow

**Problem discovered during testing:** `node_is_complete(YatraNode.NTB_LICENSE, fields)` only returned `True` when `ntb_license_number` was set. A guide saying "I don't have a license yet" would never advance past this node — the flow would loop forever.

**Fix:** Added `has_ntb_license: boolean | null` to the Claude extraction schema, added an extraction rule instructing the model to set it `false` on explicit denial, and updated `node_is_complete()` to accept either `ntb_license_number is not None` OR `has_ntb_license is False`.

**Why it matters:** This was a real product bug, not just a test issue. Without this fix, every guide without an NTB license (a substantial fraction of local guides who operate legally under agency licenses) would be stuck in an infinite registration loop.

---

### ADR-009: Lazy singleton pattern for SDK clients

**Problem discovered during testing:** `AsyncOpenAI(api_key=settings.OPENAI_API_KEY)` and `ChatAnthropic(...)` raised immediately at module import time if the API key was an empty string — which it is in any dev/test session that hasn't set every key.

**Fix:** Wrap all SDK client constructors in `@lru_cache`-decorated getter functions. Clients are instantiated on first call, not on import. Tests that don't exercise those clients never trigger the failure.

**Pattern:**
```python
@lru_cache
def _get_client() -> AsyncOpenAI:
    return AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
```

**Why not `ChatAnthropic`?** `ChatAnthropic` in the `yatra` module remains module-level because testing showed it doesn't fail eagerly on an empty key. If that changes with a library update, apply the same pattern.

---

### ADR-010: Audio never persisted

**Decision:** BridgeVoice processes audio bytes in memory for the duration of a single request. Raw audio is never written to disk, S3, or Supabase Storage.

**Reasoning:** Voice recordings between a tourist and a local guide are private conversation. Persisting them creates a GDPR/privacy liability and a security surface. The only persisted artifacts are the text transcript and translation, which the user can see and consent to.

**Future consideration:** If we add a "replay translation" feature, we should re-synthesize from the stored translation text rather than storing the audio file.

---

## Stage 2 — Frontend Decisions

### ADR-011: Expo Router (file-based routing) for both mobile apps

**Decision:** Use Expo Router's `app/` directory convention (analogous to Next.js App Router) for both `apps/guide` and `apps/mobile`.

**Reasoning:** File-based routing eliminates the boilerplate `NavigationContainer` + `createBottomTabNavigator` setup. Expo Router handles deep linking, native stack transitions, and the tab bar through config — the screen components stay pure React Native and are independently testable.

---

### ADR-012: Yatra ChatScreen sidebar layout

**Decision:** Split the chat view horizontally — 2/3 chat bubbles, 1/3 profile-building sidebar — rather than showing the sidebar as a modal or bottom sheet.

**Reasoning:** The sidebar gives the guide live visual feedback that the agent is actually building their profile, not just chatting. Each field flips from ○ (pending) to ✓ (done) as data is extracted — this is the primary trust signal that the registration is progressing. A modal or bottom sheet would require a deliberate gesture to check progress.

**Trade-off:** 110px sidebar is tight on small screens (SE-class iPhones). The `numberOfLines={1}` + abbreviated labels keep it readable. If field labels need to be longer, we'll switch to icon-only + tooltip.

---

### ADR-013: Next.js 14 App Router for the NTB dashboard

**Decision:** Server Components + App Router, not Pages Router with `getServerSideProps`.

**Reasoning:** The dashboard is data-heavy and admin-only — server-side rendering on every navigation is fine, and Server Components eliminate client-side data-fetching boilerplate. The `lib/api.ts` helper runs only on the server, keeping Supabase service-role queries out of the browser bundle.

---

---

## Stage 2 — Reliability & Admin Decisions

### ADR-014: Service-role key for admin mutations, not RLS write policies

**Decision:** The FastAPI admin router (`routers/admin.py`) uses the service-role Supabase client (bypasses RLS) for mutations (approve/reject guide) rather than crafting RLS write policies for the `ntb_admin` role.

**Reasoning:** RLS write policies for a privileged role are subtle to get right — a mistake silently grants too much or too little access. The FastAPI layer already enforces the role check explicitly via `require_admin_role()` before any data access. Using the service-role key for mutations keeps the authorization logic in one place (the router) rather than split between the router and the database policy. Reads still go through the user-scoped client where RLS applies.

**Trade-off:** The service-role key must never leak. It is only used in server-to-server calls (API → Supabase), never returned to any client. This invariant is enforced by code review and the `get_admin_supabase()` docstring.

---

### ADR-015: Append-only audit log with partition-ready schema

**Decision:** `admin_audit_log` is partitioned by `RANGE(created_at)` from day one, with no UPDATE or DELETE RLS policy.

**Reasoning:** Audit logs must be tamper-evident for NTB compliance. Making rows immutable at the database layer (no policies that allow UPDATE/DELETE) is a stronger guarantee than application-layer enforcement. Partitioning by time is free to add now and makes future archival to cold storage (archive by dropping old partitions) trivially safe.

**Cost:** Schema complexity slightly higher than a plain table. Mitigated by the default partition that handles all writes until we create time-specific partitions.

---

### ADR-016: Optimistic locking on guides.version

**Decision:** Add `guides.version INTEGER DEFAULT 1`. Every UPDATE to `guides` includes `WHERE version = <client_version>` and increments version on success. Returns 409 if the row was modified concurrently.

**Reasoning:** The NTB dashboard may have multiple admins. Without optimistic locking, Admin A could approve a guide, then Admin B (who loaded the page before the approval) could accidentally reject the same guide because they're operating on stale state. The 409 response tells Admin B to refresh and see the current state before acting.

**Alternative considered:** Pessimistic locking (`SELECT FOR UPDATE`). Rejected because it holds a Postgres lock for the duration of the HTTP request (potentially seconds if the admin pauses before confirming), degrading concurrency for all guide reads.

---

### ADR-017: Request correlation IDs via ContextVar

**Decision:** Use a `contextvars.ContextVar` to propagate the `X-Request-ID` through the async call stack without threading it through every function signature.

**Reasoning:** In an async framework like FastAPI, `threading.local()` doesn't work because multiple requests share OS threads. `ContextVar` is the Python 3.7+ async-safe equivalent — each async task (request) gets its own context copy automatically.

**Usage:** `get_request_id()` is callable from anywhere in the call stack (routers, tools, email sender) and returns the ID for the current request. This enables cross-service trace correlation without a distributed tracing SDK.

---

### ADR-018: Fire-and-forget email with asyncio.create_task

**Decision:** Email notifications after guide verification use `asyncio.get_event_loop().create_task(coro)` rather than `await`-ing them in the request handler.

**Reasoning:** A failed email must never block or roll back a guide approval. The HTTP response should return immediately after the database mutation. The email is a best-effort side effect.

**Known limitation:** If the API process crashes between creating the task and the coroutine completing, the email is silently dropped. For the current phase this is acceptable. When reliability requirements tighten, move to a Redis-backed job queue (ARQ) or a Supabase webhook trigger.

---

### ADR-019: Session persistence via expo-secure-store (not AsyncStorage)

**Decision:** The Yatra `session_id` (and Supabase JWT) are stored in `expo-secure-store`, not `AsyncStorage`.

**Reasoning:** `AsyncStorage` stores data as plain text in the app's sandbox — readable on non-jailbroken Android devices via ADB or on rooted iOS devices. `expo-secure-store` maps to the iOS Keychain / Android Keystore, which is hardware-backed on modern devices. The session_id itself is low-sensitivity (it's a server-side state reference), but the Supabase JWT is authentication-sensitive and must not be stored in plain text.

**Trade-off:** `expo-secure-store` is slightly slower than `AsyncStorage` and has a value-size limit (~2KB on iOS). Both are fine for the tokens we store.

---

### ADR-020: Server Components + server-side admin client for NTB dashboard

**Decision:** The NTB guide listing and detail pages are Next.js Server Components that call the FastAPI `/admin/*` endpoints server-side. No client-side data fetching for the guide table.

**Reasoning:** The NTB dashboard is a low-traffic, high-privilege surface. Server Components eliminate client-side API key exposure (the admin JWT is read from cookies server-side and never included in the JS bundle). The `requireAdminToken()` helper redirects unauthenticated requests to `/login` before any data is fetched — a hard server-side auth gate.

**`GuideVerificationPanel` exception:** The approve/reject interaction requires client-side state (dialog open/close, loading spinner, optimistic lock version tracking). This component is `"use client"` and fetches its own admin JWT from the Supabase client at submission time. The admin endpoint enforces its own role check — the client JWT is just a credential, not a trust boundary.

---

## Pending Decisions (to be recorded as stages progress)

- **ADR-021:** Supabase Realtime integration for the SOS feed (WebSocket vs. SSE vs. polling)
- **ADR-022:** Offline-first strategy for the tourist mobile app (AsyncStorage queue vs. MMKV vs. SQLite)
- **ADR-023:** EAS Build + OTA update strategy for Expo apps
- **ADR-024:** Trip planner agent design (whether to extend Yatra or build a separate LangGraph agent)
