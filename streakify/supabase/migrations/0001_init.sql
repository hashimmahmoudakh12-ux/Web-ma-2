-- =============================================================================
-- Streakify — database schema (phase 1)
--
-- MULTI-TENANT: every row that belongs to a café carries `cafe_id`. One
-- database serves every café; queries always filter by cafe_id.
--
-- SECURITY: Row Level Security (RLS) is ON for every table with NO public
-- policies. That means the public "anon" key can read nothing. Only our
-- server (using the secret service-role key) can touch data. Owner/admin
-- logins (phase 3/4) will add policies on top.
--
-- How to run: Supabase dashboard -> SQL Editor -> paste this file -> Run.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- cafes: one row per coffee shop (tenant)
-- -----------------------------------------------------------------------------
create table if not exists public.cafes (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'), -- subdomain: sanaacafe.streakify.com
  name              text not null,
  custom_domain     text unique,                       -- e.g. rewards.sanaacafe.com (optional)
  timezone          text not null default 'America/New_York',
  currency          text not null default 'USD',
  is_demo           boolean not null default false,
  active            boolean not null default true,
  brand             jsonb not null,                    -- logo + colors (see src/lib/brand.ts)
  program           jsonb not null,                    -- reward rules (see src/lib/program.ts)
  counter_pin_hash  text,                              -- tablet unlock PIN (hashed, never plain)
  pos_provider      text not null default 'none' check (pos_provider in ('none', 'toast')),
  pos_config        jsonb not null default '{}'::jsonb, -- Toast restaurant GUID etc. (phase 6)
  created_at        timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- customers: a person's membership at ONE café (same phone at 2 cafés = 2 rows)
-- -----------------------------------------------------------------------------
create table if not exists public.customers (
  id                     uuid primary key default gen_random_uuid(),
  cafe_id                uuid not null references public.cafes(id) on delete cascade,
  phone_e164             text not null,                -- "+13135550142"
  first_name             text not null,                -- first name or nickname (leaderboard)
  public_token           text not null unique default encode(gen_random_bytes(16), 'hex'), -- personal link (phase 2)
  birthday_month         smallint check (birthday_month between 1 and 12),
  birthday_day           smallint check (birthday_day between 1 and 31),

  -- streak state (see src/lib/streak/engine.ts -> StreakState)
  streak_visits          integer not null default 0,
  streak_weeks           integer not null default 0,
  total_visits           integer not null default 0,
  last_visit_at          timestamptz,
  last_visit_week        date,
  week_visits            integer not null default 0,
  settled_week           date,
  saver_month            text,
  savers_used_in_month   integer not null default 0,
  birthday_reward_year   integer,

  -- privacy & consent
  privacy_accepted_at    timestamptz not null,
  privacy_version        text not null,
  sms_opt_in             boolean not null default false, -- NEVER text anyone with false
  sms_opt_in_at          timestamptz,
  sms_consent_text       text,                          -- exact wording they agreed to
  leaderboard_opt_in     boolean not null default false,

  version                integer not null default 0,    -- bumps on every update (prevents double check-ins)
  created_at             timestamptz not null default now(),
  unique (cafe_id, phone_e164),
  unique (cafe_id, id)
);

-- -----------------------------------------------------------------------------
-- visits: one row per check-in
-- -----------------------------------------------------------------------------
create table if not exists public.visits (
  id             uuid primary key default gen_random_uuid(),
  cafe_id        uuid not null references public.cafes(id) on delete cascade,
  customer_id    uuid not null,
  created_at     timestamptz not null default now(),
  local_date     date not null,         -- the café's calendar day
  week_start     date not null,
  source         text not null default 'counter' check (source in ('counter', 'toast', 'demo')),
  pos_order_id   text,                  -- Toast order GUID once verified (phase 6)
  verified       boolean not null default false,
  streak_visits_after integer not null,
  level_after    text not null,
  foreign key (cafe_id, customer_id) references public.customers(cafe_id, id) on delete cascade
);
create index if not exists visits_cafe_date on public.visits (cafe_id, local_date);
create index if not exists visits_customer on public.visits (customer_id, created_at desc);

-- -----------------------------------------------------------------------------
-- rewards: every reward ever earned (value/cost are copied in at earn time,
-- so later price edits don't rewrite history — important for the profit view)
-- -----------------------------------------------------------------------------
create table if not exists public.rewards (
  id                   uuid primary key default gen_random_uuid(),
  cafe_id              uuid not null references public.cafes(id) on delete cascade,
  customer_id          uuid not null,
  kind                 text not null check (kind in ('welcome', 'level', 'surprise', 'birthday', 'leaderboard')),
  level_key            text,
  name                 text not null,
  value_cents          integer not null check (value_cents >= 0),
  cost_cents           integer not null check (cost_cents >= 0),
  status               text not null default 'available' check (status in ('available', 'redeemed', 'void')),
  earned_at            timestamptz not null default now(),
  earned_visit_id      uuid references public.visits(id) on delete set null,
  redeemed_at          timestamptz,
  redeemed_local_date  date,
  foreign key (cafe_id, customer_id) references public.customers(cafe_id, id) on delete cascade
);
create index if not exists rewards_customer on public.rewards (customer_id, status);
create index if not exists rewards_cafe_redeemed on public.rewards (cafe_id, redeemed_local_date);

-- -----------------------------------------------------------------------------
-- streak_events: history of savers used, level drops and level ups
-- -----------------------------------------------------------------------------
create table if not exists public.streak_events (
  id           bigint generated always as identity primary key,
  cafe_id      uuid not null references public.cafes(id) on delete cascade,
  customer_id  uuid not null,
  visit_id     uuid references public.visits(id) on delete set null,
  type         text not null,
  data         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  foreign key (cafe_id, customer_id) references public.customers(cafe_id, id) on delete cascade
);

-- -----------------------------------------------------------------------------
-- Row Level Security: lock everything; only the service role gets in.
-- -----------------------------------------------------------------------------
alter table public.cafes enable row level security;
alter table public.customers enable row level security;
alter table public.visits enable row level security;
alter table public.rewards enable row level security;
alter table public.streak_events enable row level security;

-- -----------------------------------------------------------------------------
-- apply_check_in: saves one check-in ALL-OR-NOTHING (one transaction).
-- The app computes the new state (TypeScript streak engine) and this function
-- writes it. `p_expected_version` makes sure nobody else updated the customer
-- in between — that stops a double-tap from counting twice.
-- -----------------------------------------------------------------------------
create or replace function public.apply_check_in(
  p_cafe_id uuid,
  p_customer_id uuid,
  p_expected_version integer,
  p_state jsonb,
  p_visit jsonb,
  p_rewards jsonb,
  p_events jsonb
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_visit_id uuid;
begin
  update customers set
    streak_visits        = (p_state->>'streakVisits')::int,
    streak_weeks         = (p_state->>'streakWeeks')::int,
    total_visits         = (p_state->>'totalVisits')::int,
    last_visit_at        = (p_state->>'lastVisitAt')::timestamptz,
    last_visit_week      = (p_state->>'lastVisitWeek')::date,
    week_visits          = (p_state->>'weekVisits')::int,
    settled_week         = (p_state->>'settledWeek')::date,
    saver_month          = p_state->>'saverMonth',
    savers_used_in_month = (p_state->>'saversUsedInMonth')::int,
    birthday_reward_year = (p_state->>'birthdayRewardYear')::int,
    version              = version + 1
  where id = p_customer_id and cafe_id = p_cafe_id and version = p_expected_version;

  if not found then
    raise exception 'STREAKIFY_CONFLICT' using errcode = 'P0001';
  end if;

  insert into visits (cafe_id, customer_id, created_at, local_date, week_start, source, streak_visits_after, level_after)
  values (
    p_cafe_id, p_customer_id,
    (p_visit->>'createdAt')::timestamptz,
    (p_visit->>'localDate')::date,
    (p_visit->>'weekStart')::date,
    coalesce(p_visit->>'source', 'counter'),
    (p_visit->>'streakVisitsAfter')::int,
    p_visit->>'levelAfter'
  )
  returning id into v_visit_id;

  insert into rewards (cafe_id, customer_id, kind, level_key, name, value_cents, cost_cents, earned_at, earned_visit_id)
  select p_cafe_id, p_customer_id, r->>'kind', r->>'levelKey', r->>'name',
         (r->>'valueCents')::int, (r->>'costCents')::int, (p_visit->>'createdAt')::timestamptz, v_visit_id
  from jsonb_array_elements(coalesce(p_rewards, '[]'::jsonb)) r;

  insert into streak_events (cafe_id, customer_id, visit_id, type, data, created_at)
  select p_cafe_id, p_customer_id, v_visit_id, e->>'type', e, (p_visit->>'createdAt')::timestamptz
  from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) e;

  return v_visit_id;
end;
$$;

-- Only the server (service role) may call it.
revoke all on function public.apply_check_in(uuid, uuid, integer, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_check_in(uuid, uuid, integer, jsonb, jsonb, jsonb, jsonb) to service_role;
