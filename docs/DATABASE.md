# Database Schema Documentation

Nepal Journey AI uses Supabase (Postgres 16) with the following extensions and schema. The full migration is in `api/db/migrations/001_initial_schema.sql`.

---

## Extensions

| Extension | Purpose |
|---|---|
| `uuid-ossp` | `uuid_generate_v4()` as default primary key |
| `vector` (pgvector) | Guide embedding storage + cosine similarity search |
| `postgis` | GPS coordinate storage and proximity queries |

---

## Enums

```sql
user_role:           tourist | guide | ntb_admin | government
guide_tier:          standard | elite
verification_status: pending | verified | rejected | suspended
booking_status:      pending | confirmed | in_progress | completed | cancelled | disputed
booking_type:        day_trip | multi_day | custom
complaint_status:    open | investigating | resolved | escalated
complaint_severity:  low | medium | high | critical
sos_status:          active | acknowledged | resolved
verification_job_status: queued | processing | completed | failed
```

---

## Tables

### `users`
Extends Supabase Auth — one row per authenticated user.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Matches `auth.users.id` |
| `email` | text | Unique |
| `full_name` | text | |
| `phone` | text | |
| `avatar_url` | text | |
| `role` | user_role | Default: `tourist` |
| `preferred_language` | text | Default: `en` |
| `created_at`, `updated_at` | timestamptz | `set_updated_at` trigger |

**RLS policies:**
- Users can read/update their own row
- NTB admins can read all users

---

### `guides`
One row per registered guide. Created by the Yatra agent after registration is confirmed.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK → users | |
| `name` | text | |
| `photo_url` | text | |
| `location` | text | |
| `experience_years` | int | |
| `specializations` | text[] | |
| `ntb_license_number` | text | Nullable — not all guides have one |
| `taan_member` | bool | Default: false |
| `first_aid_certified` | bool | Default: false |
| `languages` | text[] | |
| `daily_rate_usd` | numeric(10,2) | |
| `phone` | text | |
| `is_available` | bool | Default: true |
| `availability_start` | date | |
| `availability_end` | date | |
| `verification_status` | verification_status | Default: `pending` |
| `tier` | guide_tier | Default: `standard`. Auto-promoted by trigger |
| `rating` | numeric(3,2) | Default: 0.0. Recalculated by trigger |
| `total_reviews` | int | Default: 0 |
| `total_trips` | int | Default: 0 |
| `last_known_location` | geography(Point,4326) | Updated by tracking endpoint |
| `embedding` | vector(1536) | Guide profile embedding for tourist matching |
| `created_at`, `updated_at` | timestamptz | |

**Index:** `guides_embedding_idx` — HNSW index on `embedding` using `vector_cosine_ops`

**RLS policies:**
- All authenticated users can read verified/pending guides (for tourist discovery)
- Guides can update their own row (availability, rate, etc.)
- NTB admins can update any guide row (verification_status, tier)

---

### `tourists`
One row per registered tourist.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK → users | |
| `nationality` | text | |
| `emergency_contact_name` | text | |
| `emergency_contact_phone` | text | |
| `tracking_consent` | bool | **Default: false** — explicit opt-in required |
| `last_known_location` | geography(Point,4326) | Updated on GPS sync |
| `created_at`, `updated_at` | timestamptz | |

---

### `routes`
Static data — the 5 core Nepal trekking routes.

Seeded by `api/db/seeds/001_routes.sql`:
- Everest Base Camp (EBC)
- Annapurna Circuit
- Annapurna Base Camp (ABC)
- Manaslu Circuit
- Langtang Valley

---

### `bookings`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tourist_id` | uuid FK → tourists | |
| `guide_id` | uuid FK → guides | |
| `trip_id` | uuid FK → trips | Nullable |
| `booking_type` | booking_type | |
| `status` | booking_status | Default: `pending` |
| `start_date`, `end_date` | date | |
| `total_amount_usd` | numeric(10,2) | Tourist pays this |
| `platform_commission_usd` | numeric(10,2) | 12% of total |
| `guide_payout_usd` | numeric(10,2) | 88% of total |
| `notes` | text | |
| `created_at`, `updated_at` | timestamptz | |

**Commission formula** (computed in `routers/bookings.py`):
```python
COMMISSION_RATE = 0.12
platform_commission = total * COMMISSION_RATE  # 12%
guide_payout = total * (1 - COMMISSION_RATE)   # 88%
```

**RLS:** Tourists see their own bookings. Guides see bookings where `guide_id = auth.uid()`. NTB admins see all.

---

### `reviews`
One review per booking (enforced by unique constraint on `booking_id`).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `booking_id` | uuid FK → bookings | Unique |
| `tourist_id` | uuid FK → tourists | |
| `guide_id` | uuid FK → guides | |
| `overall_rating` | int | 1–5, required |
| `safety_rating` | int | 1–5, nullable |
| `knowledge_rating` | int | 1–5, nullable |
| `communication_rating` | int | 1–5, nullable |
| `punctuality_rating` | int | 1–5, nullable |
| `comment` | text | |
| `created_at` | timestamptz | |

**Trigger:** `recalculate_guide_rating` — after insert/update/delete on `reviews`, recomputes `guides.rating` (average of all `overall_rating`) and updates `guides.total_reviews`.

---

### `gps_tracks`
Partitioned by range on `recorded_at` (monthly partitions intended; default partition active now).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `tourist_id` | uuid FK → tourists | |
| `trip_id` | uuid FK → trips | Nullable |
| `location` | geography(Point,4326) | |
| `altitude_meters` | numeric | |
| `accuracy_meters` | numeric | |
| `recorded_at` | timestamptz | Partition key |

**RLS:** Tourists see only their own tracks. Their assigned guide sees tracks while a booking is `in_progress`.

---

### `sos_alerts`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tourist_id` | uuid FK → tourists | Nullable (guide can trigger SOS) |
| `guide_id` | uuid FK → guides | Nullable |
| `location` | geography(Point,4326) | |
| `altitude_meters` | numeric | |
| `message` | text | |
| `status` | sos_status | Default: `active` |
| `acknowledged_by` | uuid FK → users | NTB admin who acknowledged |
| `acknowledged_at`, `resolved_at` | timestamptz | |
| `created_at` | timestamptz | |

**RLS:** Tourists/guides can read their own alerts. NTB admins can read all and update status.

---

### `complaints`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `reporter_id` | uuid FK → users | |
| `reported_guide_id` | uuid FK → guides | |
| `booking_id` | uuid FK → bookings | Nullable |
| `severity` | complaint_severity | |
| `status` | complaint_status | Default: `open` |
| `description` | text | |
| `resolution_notes` | text | |
| `created_at`, `updated_at` | timestamptz | |

**Trigger:** `check_complaint_escalation` — after insert/update on `complaints`, counts open complaints against a guide in the last 90 days. If count reaches 3: escalates the complaint to `escalated`, downgrades the guide's tier to `standard`, and adds a note.

---

### `yatra_sessions`
Stores Yatra agent conversation state between requests.

| Column | Type | Notes |
|---|---|---|
| `session_id` | text PK | Client-generated, stored in expo-secure-store |
| `guide_id` | uuid FK → guides | |
| `current_node` | text | YatraNode enum value |
| `registration_fields` | jsonb | Accumulated guide data |
| `registration_complete` | bool | |
| `message_history` | jsonb | Array of `{role, content}` |
| `pending_verification` | bool | |
| `created_at`, `updated_at` | timestamptz | |

---

## Triggers

### `set_updated_at`
Applied to all tables with an `updated_at` column. Sets `updated_at = now()` before any `UPDATE`.

### `recalculate_guide_rating`
Fires after INSERT/UPDATE/DELETE on `reviews`. Recomputes:
```sql
UPDATE guides SET
  rating = (SELECT AVG(overall_rating) FROM reviews WHERE guide_id = NEW.guide_id),
  total_reviews = (SELECT COUNT(*) FROM reviews WHERE guide_id = NEW.guide_id)
WHERE id = NEW.guide_id;
```

### `check_complaint_escalation`
Fires after INSERT/UPDATE on `complaints`. If a guide has ≥ 3 open/investigating complaints in the rolling 90 days:
- Sets complaint status to `escalated`
- Downgrades `guides.tier` to `standard`

### `check_elite_promotion`
Fires after INSERT/UPDATE on `guides`. Promotes to `elite` tier if all conditions met:
- `total_trips >= 20`
- `rating >= 4.5` with `total_reviews >= 10`
- `verification_status = 'verified'`
- No open complaints

---

## Vector Search

The `match_guides` SQL function performs ANN cosine similarity search:

```sql
CREATE FUNCTION match_guides(
  query_embedding vector(1536),
  match_count int default 5
)
RETURNS TABLE (
  id uuid, name text, location text, experience_years int,
  specializations text[], languages text[], daily_rate_usd numeric,
  rating numeric, total_reviews int, tier guide_tier,
  is_available bool, verification_status verification_status,
  photo_url text, similarity float
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT id, name, location, experience_years, specializations, languages,
         daily_rate_usd, rating, total_reviews, tier, is_available,
         verification_status, photo_url,
         1 - (embedding <=> query_embedding) AS similarity
  FROM guides
  WHERE verification_status IN ('pending', 'verified')
    AND embedding IS NOT NULL
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
```

Called from `api/tools/guide_match.py` via `supabase.rpc("match_guides", {...})`.
