-- Nepal Journey AI — initial schema
-- Tables: users, guides, tourists, routes, trips, bookings, reviews,
-- complaints, gps_tracks, sos_alerts, verification_jobs, yatra_sessions.

create extension if not exists "uuid-ossp";
create extension if not exists "vector";
create extension if not exists "postgis";

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------

create type user_role as enum ('tourist', 'guide', 'operator', 'government', 'admin');
create type guide_tier as enum ('basic', 'verified', 'elite');
create type verification_status as enum ('pending', 'verified', 'rejected', 'expired');
create type booking_status as enum ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'disputed');
create type booking_type as enum ('guide', 'hotel', 'transport', 'gear', 'permit');
create type complaint_status as enum ('open', 'in_review', 'resolved', 'escalated');
create type complaint_severity as enum ('low', 'medium', 'high', 'critical');
create type sos_status as enum ('active', 'acknowledged', 'resolved', 'false_alarm');
create type verification_job_status as enum ('queued', 'processing', 'verified', 'failed');

-- ---------------------------------------------------------------------
-- Users (extends Supabase auth.users)
-- ---------------------------------------------------------------------

create table users (
    id uuid primary key references auth.users(id) on delete cascade,
    role user_role not null default 'tourist',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Guides
-- ---------------------------------------------------------------------

create table guides (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid not null references users(id) on delete cascade,
    name text not null,
    location text,
    experience_years integer check (experience_years >= 0),
    specializations text[] not null default '{}',
    ntb_license_number text,
    taan_member boolean not null default false,
    first_aid_certified boolean not null default false,
    languages text[] not null default '{}',
    daily_rate_usd numeric(10, 2) check (daily_rate_usd >= 0),
    phone text,
    photo_url text,
    availability_start date,
    availability_end date,
    is_available boolean not null default true,
    tier guide_tier not null default 'basic',
    verification_status verification_status not null default 'pending',
    rating_avg numeric(3, 2) not null default 0,
    total_reviews integer not null default 0,
    total_trips integer not null default 0,
    category_ratings jsonb not null default '{
        "safety": 0, "knowledge": 0, "communication": 0,
        "punctuality": 0, "value": 0, "flexibility": 0
    }',
    -- text-embedding-3-small dimensionality, used for tourist<->guide matching
    embedding vector(1536),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index guides_user_id_idx on guides(user_id);
create index guides_is_available_idx on guides(is_available) where is_available = true;
create index guides_embedding_idx on guides using hnsw (embedding vector_cosine_ops);

-- Cosine-similarity guide search, called via supabase.rpc("match_guides", ...)
-- from api/tools/guide_match.py. security definer so it can read guide rows
-- regardless of the caller's RLS context (guide directory is public anyway).
create or replace function match_guides(query_embedding vector(1536), match_count int default 5)
returns table (id uuid, name text, location text, specializations text[], rating_avg numeric, similarity float)
language sql stable security definer as $$
    select id, name, location, specializations, rating_avg,
           1 - (embedding <=> query_embedding) as similarity
    from guides
    where embedding is not null and is_available = true
    order by embedding <=> query_embedding
    limit match_count;
$$;

-- ---------------------------------------------------------------------
-- Tourists
-- ---------------------------------------------------------------------

create table tourists (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid not null references users(id) on delete cascade,
    name text,
    nationality text,
    emergency_contact jsonb,
    -- Opt-in only. Tourist must explicitly set this true; revocable at any time.
    tracking_consent boolean not null default false,
    last_known_location geography(point, 4326),
    last_known_location_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index tourists_user_id_idx on tourists(user_id);

-- ---------------------------------------------------------------------
-- Routes (Nepal trekking route reference data, seeded separately)
-- ---------------------------------------------------------------------

create table routes (
    id uuid primary key default uuid_generate_v4(),
    name text not null,
    slug text unique not null,
    description text,
    difficulty text,
    duration_days_min integer,
    duration_days_max integer,
    max_elevation_meters integer,
    permits_required text[] not null default '{}',
    best_months integer[] not null default '{}',
    estimated_cost_usd_min integer,
    estimated_cost_usd_max integer,
    embedding vector(1536),
    created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Trips
-- ---------------------------------------------------------------------

create table trips (
    id uuid primary key default uuid_generate_v4(),
    tourist_id uuid not null references tourists(id) on delete cascade,
    route_id uuid references routes(id),
    title text,
    start_date date,
    end_date date,
    status text not null default 'planning',
    itinerary jsonb not null default '[]',
    permits jsonb not null default '[]',
    total_cost_usd numeric(10, 2),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index trips_tourist_id_idx on trips(tourist_id);

-- ---------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------

create table bookings (
    id uuid primary key default uuid_generate_v4(),
    trip_id uuid references trips(id) on delete set null,
    tourist_id uuid not null references tourists(id),
    guide_id uuid references guides(id),
    booking_type booking_type not null,
    start_date date,
    end_date date,
    status booking_status not null default 'pending',
    total_amount_usd numeric(10, 2),
    commission_usd numeric(10, 2),
    notes text,
    metadata jsonb not null default '{}',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index bookings_tourist_id_idx on bookings(tourist_id);
create index bookings_guide_id_idx on bookings(guide_id);
create index bookings_status_idx on bookings(status);

-- ---------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------

create table reviews (
    id uuid primary key default uuid_generate_v4(),
    booking_id uuid not null references bookings(id),
    guide_id uuid not null references guides(id),
    tourist_id uuid not null references tourists(id),
    overall_rating integer not null check (overall_rating between 1 and 5),
    safety_rating integer check (safety_rating between 1 and 5),
    knowledge_rating integer check (knowledge_rating between 1 and 5),
    communication_rating integer check (communication_rating between 1 and 5),
    punctuality_rating integer check (punctuality_rating between 1 and 5),
    value_rating integer check (value_rating between 1 and 5),
    flexibility_rating integer check (flexibility_rating between 1 and 5),
    body text,
    route_id uuid references routes(id),
    guide_response text,
    guide_response_at timestamptz,
    helpful_votes integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (booking_id)
);

create index reviews_guide_id_idx on reviews(guide_id);

-- ---------------------------------------------------------------------
-- Complaints
-- ---------------------------------------------------------------------

create table complaints (
    id uuid primary key default uuid_generate_v4(),
    booking_id uuid references bookings(id),
    guide_id uuid not null references guides(id),
    tourist_id uuid not null references tourists(id),
    issue_type text not null,
    severity complaint_severity not null default 'medium',
    description text not null,
    requested_resolution text,
    evidence_urls text[] not null default '{}',
    status complaint_status not null default 'open',
    admin_notes text,
    auto_escalated boolean not null default false,
    resolved_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index complaints_guide_id_idx on complaints(guide_id);
create index complaints_status_idx on complaints(status);

-- ---------------------------------------------------------------------
-- GPS tracks
--
-- High-volume table. Partitioning by month is the planned scaling path
-- once write volume justifies it — scaffold below, commented out until
-- then. A single default partition holds everything in the meantime.
-- ---------------------------------------------------------------------

create table gps_tracks (
    id uuid primary key default uuid_generate_v4(),
    tourist_id uuid not null references tourists(id),
    trip_id uuid references trips(id),
    location geography(point, 4326) not null,
    altitude_meters numeric(8, 2),
    accuracy_meters numeric(8, 2),
    recorded_at timestamptz not null default now(),
    synced_at timestamptz not null default now()
) partition by range (recorded_at);

create table gps_tracks_default partition of gps_tracks default;

create index gps_tracks_tourist_id_idx on gps_tracks(tourist_id);
create index gps_tracks_location_idx on gps_tracks using gist(location);

-- Monthly partitioning scaffold (uncomment and run via a scheduled job
-- once gps_tracks write volume justifies it; drop the default partition's
-- catch-all role once historical data has been backfilled into monthly
-- partitions):
--
-- create table gps_tracks_y2026m01 partition of gps_tracks
--     for values from ('2026-01-01') to ('2026-02-01');
-- create table gps_tracks_y2026m02 partition of gps_tracks
--     for values from ('2026-02-01') to ('2026-03-01');
-- (repeat per month; automate with pg_partman or a cron-triggered function)

-- ---------------------------------------------------------------------
-- SOS alerts
-- ---------------------------------------------------------------------

create table sos_alerts (
    id uuid primary key default uuid_generate_v4(),
    tourist_id uuid references tourists(id),
    guide_id uuid references guides(id),
    location geography(point, 4326),
    altitude_meters numeric(8, 2),
    message text,
    status sos_status not null default 'active',
    acknowledged_by uuid references users(id),
    acknowledged_at timestamptz,
    resolved_at timestamptz,
    created_at timestamptz not null default now()
);

create index sos_alerts_status_idx on sos_alerts(status) where status = 'active';

-- ---------------------------------------------------------------------
-- NTB verification jobs
-- ---------------------------------------------------------------------

create table verification_jobs (
    id uuid primary key default uuid_generate_v4(),
    guide_id uuid not null references guides(id),
    license_number text not null,
    status verification_job_status not null default 'queued',
    result jsonb,
    created_at timestamptz not null default now(),
    processed_at timestamptz
);

create index verification_jobs_status_idx on verification_jobs(status) where status = 'queued';

-- ---------------------------------------------------------------------
-- Yatra sessions (guide registration + operational chat state)
-- ---------------------------------------------------------------------

create table yatra_sessions (
    id uuid primary key default uuid_generate_v4(),
    session_id text unique not null,
    guide_id uuid not null references guides(id),
    current_node text not null default 'name',
    registration_fields jsonb not null default '{}',
    registration_complete boolean not null default false,
    message_history jsonb not null default '[]',
    pending_verification boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index yatra_sessions_guide_id_idx on yatra_sessions(guide_id);

-- ---------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger users_set_updated_at before update on users for each row execute function set_updated_at();
create trigger guides_set_updated_at before update on guides for each row execute function set_updated_at();
create trigger tourists_set_updated_at before update on tourists for each row execute function set_updated_at();
create trigger trips_set_updated_at before update on trips for each row execute function set_updated_at();
create trigger bookings_set_updated_at before update on bookings for each row execute function set_updated_at();
create trigger reviews_set_updated_at before update on reviews for each row execute function set_updated_at();
create trigger complaints_set_updated_at before update on complaints for each row execute function set_updated_at();
create trigger yatra_sessions_set_updated_at before update on yatra_sessions for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Trigger: recalculate guide rating_avg + category_ratings after review
-- insert/update/delete.
-- ---------------------------------------------------------------------

create or replace function recalculate_guide_rating()
returns trigger as $$
declare
    target_guide_id uuid := coalesce(new.guide_id, old.guide_id);
    agg record;
begin
    select
        avg(overall_rating) as overall,
        avg(safety_rating) as safety,
        avg(knowledge_rating) as knowledge,
        avg(communication_rating) as communication,
        avg(punctuality_rating) as punctuality,
        avg(value_rating) as value,
        avg(flexibility_rating) as flexibility,
        count(*) as review_count
    into agg
    from reviews
    where guide_id = target_guide_id;

    update guides set
        rating_avg = coalesce(agg.overall, 0),
        total_reviews = agg.review_count,
        category_ratings = jsonb_build_object(
            'safety', coalesce(agg.safety, 0),
            'knowledge', coalesce(agg.knowledge, 0),
            'communication', coalesce(agg.communication, 0),
            'punctuality', coalesce(agg.punctuality, 0),
            'value', coalesce(agg.value, 0),
            'flexibility', coalesce(agg.flexibility, 0)
        )
    where id = target_guide_id;

    return coalesce(new, old);
end;
$$ language plpgsql;

create trigger recalculate_guide_rating_on_review
after insert or update or delete on reviews
for each row execute function recalculate_guide_rating();

-- ---------------------------------------------------------------------
-- Trigger: auto-escalate a complaint (and downgrade guide tier) when a
-- guide accumulates 3+ open complaints within a rolling 90-day window.
-- ---------------------------------------------------------------------

create or replace function check_complaint_escalation()
returns trigger as $$
declare
    open_complaint_count integer;
begin
    select count(*) into open_complaint_count
    from complaints
    where guide_id = new.guide_id
      and created_at > now() - interval '90 days'
      and status not in ('resolved');

    if open_complaint_count >= 2 then
        -- this row will be the 3rd; escalate it and downgrade the guide
        new.status := 'escalated';
        new.auto_escalated := true;

        update guides
        set tier = case tier
                when 'elite' then 'verified'
                else 'basic'
            end,
            verification_status = 'pending'
        where id = new.guide_id;
    end if;

    return new;
end;
$$ language plpgsql;

create trigger check_complaint_escalation_on_insert
before insert on complaints
for each row execute function check_complaint_escalation();

-- ---------------------------------------------------------------------
-- Trigger: auto-promote a guide to 'elite' tier when they cross the
-- threshold (20+ completed trips, 4.5+ rating across 10+ reviews,
-- zero open complaints, NTB-verified).
-- ---------------------------------------------------------------------

create or replace function check_elite_promotion()
returns trigger as $$
begin
    if new.total_trips >= 20
       and new.rating_avg >= 4.5
       and new.total_reviews >= 10
       and new.verification_status = 'verified'
       and not exists (
           select 1 from complaints
           where guide_id = new.id
             and status in ('open', 'in_review', 'escalated')
       )
    then
        new.tier := 'elite';
    end if;

    return new;
end;
$$ language plpgsql;

create trigger check_elite_promotion_on_update
before update on guides
for each row
when (
    new.total_trips is distinct from old.total_trips
    or new.rating_avg is distinct from old.rating_avg
    or new.verification_status is distinct from old.verification_status
)
execute function check_elite_promotion();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

alter table users enable row level security;
alter table guides enable row level security;
alter table tourists enable row level security;
alter table trips enable row level security;
alter table bookings enable row level security;
alter table reviews enable row level security;
alter table complaints enable row level security;
alter table gps_tracks enable row level security;
alter table sos_alerts enable row level security;
alter table verification_jobs enable row level security;
alter table yatra_sessions enable row level security;

create or replace function is_admin_or_government()
returns boolean as $$
    select exists (
        select 1 from users
        where id = auth.uid() and role in ('admin', 'government')
    );
$$ language sql security definer stable;

-- users: a user can read/update only their own row
create policy users_self_select on users for select using (id = auth.uid());
create policy users_self_update on users for update using (id = auth.uid());

-- guides: profile is publicly readable (tourists need to discover guides);
-- only the owning guide can modify their own row.
create policy guides_public_select on guides for select using (true);
create policy guides_self_modify on guides for all
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

-- tourists: strictly self-access only
create policy tourists_self_access on tourists for all
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

-- trips: owning tourist only
create policy trips_owner_access on trips for all
    using (tourist_id in (select id from tourists where user_id = auth.uid()))
    with check (tourist_id in (select id from tourists where user_id = auth.uid()));

-- bookings: visible to the tourist or guide involved, or admin
create policy bookings_participant_access on bookings for all
    using (
        tourist_id in (select id from tourists where user_id = auth.uid())
        or guide_id in (select id from guides where user_id = auth.uid())
        or is_admin_or_government()
    )
    with check (
        tourist_id in (select id from tourists where user_id = auth.uid())
        or guide_id in (select id from guides where user_id = auth.uid())
    );

-- reviews: publicly readable; only the tourist on the underlying booking can write
create policy reviews_public_select on reviews for select using (true);
create policy reviews_tourist_insert on reviews for insert
    with check (tourist_id in (select id from tourists where user_id = auth.uid()));
create policy reviews_guide_response_update on reviews for update
    using (guide_id in (select id from guides where user_id = auth.uid()));

-- complaints: visible to the filing tourist, the named guide, or admin
create policy complaints_participant_select on complaints for select
    using (
        tourist_id in (select id from tourists where user_id = auth.uid())
        or guide_id in (select id from guides where user_id = auth.uid())
        or is_admin_or_government()
    );
create policy complaints_tourist_insert on complaints for insert
    with check (tourist_id in (select id from tourists where user_id = auth.uid()));
create policy complaints_admin_update on complaints for update
    using (is_admin_or_government());

-- gps_tracks: the tracked tourist (opt-in) or admin/government dashboards
create policy gps_tracks_tourist_access on gps_tracks for all
    using (tourist_id in (select id from tourists where user_id = auth.uid()))
    with check (tourist_id in (select id from tourists where user_id = auth.uid()));
create policy gps_tracks_admin_select on gps_tracks for select
    using (is_admin_or_government());

-- sos_alerts: the tourist/guide involved, or admin/government
create policy sos_alerts_participant_access on sos_alerts for all
    using (
        tourist_id in (select id from tourists where user_id = auth.uid())
        or guide_id in (select id from guides where user_id = auth.uid())
        or is_admin_or_government()
    );

-- verification_jobs: the owning guide can read; only admin can write
create policy verification_jobs_guide_select on verification_jobs for select
    using (
        guide_id in (select id from guides where user_id = auth.uid())
        or is_admin_or_government()
    );

-- yatra_sessions: the owning guide only
create policy yatra_sessions_guide_access on yatra_sessions for all
    using (guide_id in (select id from guides where user_id = auth.uid()))
    with check (guide_id in (select id from guides where user_id = auth.uid()));
