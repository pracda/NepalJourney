# Nepal Journey AI

> A three-sided AI travel platform connecting tourists, local trekking guides, and the Nepal Tourism Board.

---

## Platform Overview

Nepal Journey AI solves a coordination problem unique to Nepal's trekking industry: tourists can't discover and trust local guides, guides lack modern tools to find clients and manage their business, and the NTB has no unified visibility into the safety and compliance of operators in the field.

**Three sides of the platform:**

| Audience | App | Core Value |
|---|---|---|
| Tourists | `apps/mobile` (Expo) | AI guide matching, GPS trek tracking, real-time voice translation |
| Guides | `apps/guide` (Expo) | Yatra AI onboarding assistant, bookings, earnings |
| NTB / Government | `apps/web` (Next.js) | Operations dashboard, SOS feed, guide verification, analytics |

---

## Monorepo Structure

```
nepal-journey/
├── api/                        # FastAPI backend (Python 3.11, Poetry)
│   ├── agents/
│   │   ├── yatra.py            # LangGraph guide-onboarding + operational agent
│   │   └── translation.py      # BridgeVoice: Whisper → Claude → OpenAI TTS
│   ├── db/
│   │   ├── client.py           # Supabase clients (anon, admin, user-scoped RLS)
│   │   ├── migrations/         # PostgreSQL schema (pgvector, PostGIS, RLS, triggers)
│   │   └── seeds/              # Route seed data (5 Nepal treks)
│   ├── middleware/
│   │   └── rate_limit.py       # Redis-backed fixed-window rate limiting
│   ├── routers/                # FastAPI route handlers
│   │   ├── auth.py             # JWT validation, /me endpoint
│   │   ├── chat.py             # Yatra chat endpoints
│   │   ├── guides.py           # Guide listing + AI matching
│   │   ├── bookings.py         # Booking CRUD (12% commission logic)
│   │   ├── tracking.py         # GPS batch upload + SOS dispatch
│   │   └── translate.py        # BridgeVoice voice + text translation
│   ├── tools/
│   │   ├── guide_match.py      # pgvector embedding + cosine similarity search
│   │   ├── ntb_verify.py       # NTB license verification job queue
│   │   ├── sos_dispatch.py     # SOS alert creation
│   │   └── weather.py          # Open-Meteo forecast (no API key)
│   └── tests/                  # pytest test suite (10 tests, all passing)
│
├── apps/
│   ├── guide/                  # Guide Expo app (Yatra ChatScreen, Bookings, Earnings)
│   ├── mobile/                 # Tourist Expo app (Planner, Map, Translate, Bookings)
│   └── web/                    # NTB Next.js 14 dashboard (Overview, SOS, Guides, Analytics)
│
├── packages/
│   ├── types/                  # Shared TypeScript types (@nepal-journey/types)
│   └── config/                 # Shared ESLint, tsconfig, Tailwind (@nepal-journey/config)
│
├── docker-compose.yml          # Local dev: Postgres (pgvector) + Redis + API
└── .github/workflows/ci.yml   # CI: ruff + pytest (API) + typecheck + Next build (TS)
```

---

## Quick Start

### Prerequisites

- Python 3.11, [Poetry](https://python-poetry.org/)
- Node 20, [pnpm](https://pnpm.io/) 8.15+
- Docker (for local Postgres + Redis)
- A Supabase project (for Auth, Storage, Realtime)

### 1. Clone and install

```bash
git clone https://github.com/pracda/NepalJourney.git
cd NepalJourney
pnpm install
```

### 2. Set up environment variables

```bash
# Root (public/build-time vars for Expo + Next.js)
cp .env.example .env

# API (server-side secrets)
cp api/.env.example api/.env
# Fill in: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
#           JWT_SECRET, ANTHROPIC_API_KEY, OPENAI_API_KEY

# Apps
cp apps/guide/.env.example apps/guide/.env
cp apps/mobile/.env.example apps/mobile/.env
cp apps/web/.env.example apps/web/.env.local
```

### 3. Run the database migration

```bash
# Option A: Docker (Postgres + Redis + API together)
docker compose up

# Option B: Apply migration to your Supabase project
# Paste api/db/migrations/001_initial_schema.sql into the Supabase SQL editor
# Then run api/db/seeds/001_routes.sql
```

### 4. Start development servers

```bash
# In separate terminals:
pnpm dev:web          # Next.js dashboard → http://localhost:3000
cd api && poetry run uvicorn main:app --reload  # API → http://localhost:8000
pnpm --filter @nepal-journey/guide start        # Guide Expo app
pnpm --filter @nepal-journey/mobile start       # Tourist Expo app
```

### 5. Run API tests

```bash
cd api
poetry run pytest tests/ -v --asyncio-mode=auto
# Expected: 10 passed
```

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| API | FastAPI (Python 3.11) | Async, typed, fast to iterate |
| Agent orchestration | LangGraph + LangChain | Stateful conversation graphs with conditional routing |
| LLM | Claude (`claude-sonnet-4-6`) | Entity extraction, translation, conversational fallback |
| STT | OpenAI Whisper (`whisper-1`) | Multilingual, no server setup |
| TTS | OpenAI TTS (`tts-1`) | Low-latency speech synthesis |
| Embeddings | OpenAI `text-embedding-3-small` | 1536-dim, cost-effective |
| Database | Supabase (Postgres 16) | Auth + RLS + Realtime in one |
| Vector search | pgvector (HNSW index) | Cosine similarity guide matching |
| Geo | PostGIS | GPS track storage + proximity queries |
| Rate limiting | Redis (fixed-window) | Separate limits for AI-cost endpoints |
| Mobile | Expo / React Native | iOS + Android from one codebase |
| Web dashboard | Next.js 14 App Router | Server components, Tailwind, type-safe |
| Monorepo | pnpm workspaces | Shared packages without publishing |

---

## Security Design

- **RLS as primary access control** — Supabase Row-Level Security policies are the enforcement boundary. The service-role key is never used from client-facing endpoints.
- **User-scoped Supabase clients** — `get_user_scoped_supabase(access_token)` attaches the caller's JWT to PostgREST so `auth.uid()` resolves inside every policy.
- **JWT validation** — `python-jose` validates Supabase-issued HS256 tokens server-side before any protected endpoint runs.
- **Prompt injection defense** — Yatra's entity-extraction prompt wraps user input in `<user_message>` XML tags and explicitly instructs Claude to treat it as untrusted data only. Input is sanitized (control chars stripped, 2000-char cap) before passing to the LLM.
- **GPS opt-in** — `tourists.tracking_consent = false` by default. The tracking endpoint returns 403 if consent is not set.
- **Audio privacy** — BridgeVoice never persists raw audio to disk or Supabase. Audio bytes are processed in memory for the duration of a single request.
- **Rate limiting** — `/chat/*` endpoints (AI-cost-bearing) have tighter limits than general endpoints. Limits are enforced by Redis fixed-window counters keyed by JWT `sub` or client IP.

---

## Revenue Model

- **12% platform commission** on every booking (computed in `routers/bookings.py`)
- Guide payouts released 48h after trip completion
- Elite tier guides (auto-promoted by Postgres trigger: 20+ trips, 4.5+ rating, no open complaints) command higher rates and higher search ranking

---

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) for the full stage-by-stage build plan.

---

## Contributing

This is a solo founder project in active development. The CI pipeline (GitHub Actions) must pass before any merge to `main`. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for design decisions.

---

*Built with Claude Code · Nepal Tourism Board partnership initiative*
