# Development Roadmap

Stage-by-stage build plan for Nepal Journey AI. Each stage has a clear goal, deliverables, and a demo target so the platform is always in a shippable state at the end of every stage.

---

## Stage 0 — Foundation ✅ Complete

**Goal:** Monorepo scaffold, database schema, backend API skeleton, core agents verified by tests.

**Deliverables:**
- pnpm workspace monorepo (`apps/*`, `packages/*`)
- Docker Compose local dev environment (Postgres + pgvector + Redis + API)
- Full Postgres schema with RLS, pgvector, PostGIS, triggers, and partitioning scaffold
- FastAPI app with 6 routers: auth, chat, guides, bookings, tracking, translate
- Yatra guide-onboarding agent (LangGraph `StateGraph`, 11-node registration + operational phase)
- BridgeVoice translation pipeline (Whisper → Claude → OpenAI TTS)
- Shared TypeScript types (`@nepal-journey/types`) and config (`@nepal-journey/config`)
- Expo guide app with Yatra ChatScreen (sidebar with live field status)
- Expo tourist app (Planner, Map with offline GPS queue, BridgeVoice Translate screen)
- Next.js 14 NTB dashboard (Overview, Guides, SOS Feed, Disputes, Analytics pages)
- GitHub Actions CI (pytest + typecheck + Next.js build)

**Demo target:** Yatra agent registers a guide end-to-end in the chat UI. 10/10 tests pass.

---

## Stage 1 — Auth + End-to-End Login Flow 🔜 Next

**Goal:** A real user can sign up, log in, and the app persists their session. Both guide and tourist flows are distinct at signup.

**Tasks:**
- [ ] Supabase Auth setup: email/OTP for both apps; set `user_metadata.role` on signup
- [ ] `apps/guide` — login/signup screens wired to Supabase Auth JS SDK
- [ ] `apps/mobile` — login/signup screens
- [ ] Token storage in `expo-secure-store`, auto-refresh on expiry
- [ ] `apps/web` — NTB admin login (Supabase email + password, `ntb_admin` role check)
- [ ] API: verify that `GET /guides/me`, `GET /bookings`, `POST /chat/yatra` all 401 without token and return the right user's data with one
- [ ] Integration test: full Yatra registration flow from login through first operational message

**Documentation to produce:**
- `docs/AUTH.md` — auth flow diagrams for each user type, token lifecycle, RLS policy map

---

## Stage 2 — Guide Registration Demoable End-to-End

**Goal:** A guide can open the app, complete Yatra registration, and their profile appears in the NTB dashboard.

**Tasks:**
- [ ] Wire `apps/guide` ChatScreen to the live API (replace mock/placeholder session IDs)
- [ ] Persist `session_id` in `expo-secure-store` so registration survives app restarts
- [ ] `greet_guide` detects an existing completed session → skip registration, go to operational mode
- [ ] NTB dashboard Guides page: fetch real data from Supabase, show pending-verification guides
- [ ] NTB admin can click "Approve" / "Reject" → updates `guides.verification_status` + triggers email (Supabase email or Resend)
- [ ] Yatra operational phase: guide can toggle availability, ask about their upcoming bookings

**Documentation to produce:**
- `docs/YATRA.md` — Yatra agent state machine diagram, node descriptions, extraction schema, prompt injection defenses
- `docs/GUIDE_ONBOARDING.md` — guide registration UX walkthrough with screenshots

---

## Stage 3 — Tourist Booking Flow

**Goal:** A tourist can find a guide, make a booking, and the guide is notified.

**Tasks:**
- [ ] `apps/mobile` Planner screen: AI guide match works end-to-end (embeddings are pre-generated from seeded guides)
- [ ] Guide detail screen: show full profile, availability calendar, reviews
- [ ] Booking creation flow: date picker, booking type, confirm + pay (Stripe integration or placeholder)
- [ ] Push notifications: guide notified on new booking request (Expo Push / FCM)
- [ ] Guide `apps/guide` Bookings screen: accept/decline incoming requests
- [ ] Tourist Bookings screen: live status updates via Supabase Realtime
- [ ] 12% commission calculation visible to both parties

**Documentation to produce:**
- `docs/BOOKING_FLOW.md` — booking state machine, commission model, payout schedule

---

## Stage 4 — GPS Tracking + SOS

**Goal:** A tourist on a trek shares their location with their guide and the NTB. SOS alerts reach the dashboard in real time.

**Tasks:**
- [ ] Tourist consent flow: explicit opt-in screen before tracking starts
- [ ] Background location task (`expo-task-manager`) for GPS logging during active trip
- [ ] Supabase Realtime: guide's app shows tourist's live location on map
- [ ] NTB dashboard SOS feed: live WebSocket updates via Supabase Realtime subscription
- [ ] SOS acknowledge + dispatch rescue workflow (NTB admin action → status update → guide + tourist notified)
- [ ] GPS track playback: NTB admin can replay a trip's track after the fact

**Documentation to produce:**
- `docs/TRACKING.md` — GPS architecture, offline queue design, consent model, SOS escalation flow

---

## Stage 5 — BridgeVoice Polish + Offline

**Goal:** Voice translation works reliably in the field, including areas with intermittent connectivity.

**Tasks:**
- [ ] Offline fallback: `whisper.cpp` tiny model on-device for transcription when offline
- [ ] Cached phrase bank: top 50 trekking phrases pre-translated, available without network
- [ ] Conversation history: last 5 exchanges shown below the translate button for context
- [ ] Language auto-detect: let Whisper identify the source language rather than requiring manual selection
- [ ] Audio quality indicator: warn if recording is too short or too quiet

**Documentation to produce:**
- `docs/BRIDGEVOICE.md` — translation pipeline, offline architecture, supported language roadmap

---

## Stage 6 — NTB Dashboard Full Data + Analytics

**Goal:** The NTB dashboard shows live, meaningful data and is useful as an operational tool.

**Tasks:**
- [ ] Guide verification workflow: NTB admin reviews submitted NTB license numbers, approves/rejects via dashboard
- [ ] Disputes page: render open complaints, allow NTB admin to add resolution notes
- [ ] Analytics charts: bookings over time, revenue by route, active trekkers count (Recharts or Chart.js)
- [ ] Live map: trekkers with active GPS consent shown on a PostGIS-backed map tile
- [ ] Export: CSV download of bookings / complaints for monthly reporting

**Documentation to produce:**
- `docs/NTB_DASHBOARD.md` — dashboard feature guide, admin role permissions, data retention policy

---

## Stage 7 — Production Readiness

**Goal:** The platform can be deployed and used by real guides and tourists.

**Tasks:**
- [ ] EAS Build: guide and mobile apps on TestFlight / internal track
- [ ] Vercel deployment: `apps/web` with preview deploys on PRs
- [ ] API deployment: Railway or Fly.io (Dockerfile is already written)
- [ ] Sentry error tracking wired for all three surfaces
- [ ] Load test: k6 script for `/chat/yatra` (AI endpoint) and `/tracking/gps/batch`
- [ ] Secrets rotation plan documented
- [ ] GDPR/privacy: data deletion endpoint for tourist accounts

**Documentation to produce:**
- `docs/DEPLOYMENT.md` — environment setup, deployment pipeline, secrets management
- `docs/PRIVACY.md` — data collected, retention, deletion procedures

---

## Stage 8 — Trip Planner Agent

**Goal:** A tourist can have a multi-turn AI conversation to plan their entire trek (route, dates, gear, permits, weather).

**Tasks:**
- [ ] New LangGraph agent: `planner.py` (separate from Yatra, uses `weather.py` + route data)
- [ ] Integration with guide matching: planner recommends specific guides based on trip plan
- [ ] Permit information: auto-include permit requirements for chosen route (seeded in `routes` table)
- [ ] Itinerary export: PDF or shareable link

**Documentation to produce:**
- `docs/TRIP_PLANNER.md` — agent design, conversation flow, integration with booking

---

*Stages are sequential but deliverables within a stage can be parallelized. Each stage ends with a demo and a documentation commit.*
