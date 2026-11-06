-- =============================================================================
-- Streakify — gamification, PWA push, Apple/Google Wallet
-- Run AFTER 0001 and 0002 (Supabase -> SQL Editor -> paste -> Run).
-- =============================================================================

-- Squads: friends who share a group streak
create table if not exists public.squads (
  id                  uuid primary key default gen_random_uuid(),
  cafe_id             uuid not null references public.cafes(id) on delete cascade,
  name                text not null,
  code                text not null,              -- invite code friends type in
  streak_weeks        integer not null default 0,
  last_complete_week  date,
  created_at          timestamptz not null default now(),
  unique (cafe_id, code)
);
alter table public.squads enable row level security;

-- Customers: XP + all game progress (badges, stamps, challenges...) as JSON
alter table public.customers add column if not exists xp integer not null default 0;
alter table public.customers add column if not exists game jsonb not null default '{}'::jsonb;
alter table public.customers add column if not exists referral_code text;
alter table public.customers add column if not exists squad_id uuid references public.squads(id) on delete set null;
alter table public.customers add column if not exists updated_at timestamptz not null default now();
-- Existing members keep their place: 1 old "streak visit" = 100 XP
update public.customers set xp = streak_visits * 100 where xp = 0 and streak_visits > 0;
update public.customers set referral_code = upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6)) where referral_code is null;
alter table public.customers alter column referral_code set not null;
create unique index if not exists customers_referral_code on public.customers (cafe_id, referral_code);
create index if not exists customers_squad on public.customers (squad_id);

alter table public.visits add column if not exists xp integer not null default 0;

-- More reward types
alter table public.rewards drop constraint if exists rewards_kind_check;
alter table public.rewards add constraint rewards_kind_check check (kind in
  ('welcome', 'level', 'surprise', 'birthday', 'leaderboard', 'milestone', 'badge', 'challenge', 'passport', 'mystery'));

-- Web push (home-screen app notifications), only for customers who said yes
create table if not exists public.push_subscriptions (
  id          bigint generated always as identity primary key,
  cafe_id     uuid not null references public.cafes(id) on delete cascade,
  customer_id uuid not null,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now(),
  foreign key (cafe_id, customer_id) references public.customers(cafe_id, id) on delete cascade
);
alter table public.push_subscriptions enable row level security;

-- Apple Wallet: which iPhones hold which pass (for automatic pass updates)
create table if not exists public.wallet_registrations (
  device_library_id text not null,
  pass_type_id      text not null,
  serial            text not null,      -- = customer id
  push_token        text not null,
  created_at        timestamptz not null default now(),
  primary key (device_library_id, pass_type_id, serial)
);
create index if not exists wallet_registrations_serial on public.wallet_registrations (serial);
alter table public.wallet_registrations enable row level security;

-- One function for every change to a customer (check-in or not), all-or-nothing.
-- p_visit may be null (e.g. a drink stamp or opening a mystery dallah).
-- p_meta = {"createdAt": "...", "localDate": "YYYY-MM-DD"}
create or replace function public.apply_customer_update(
  p_cafe_id uuid,
  p_customer_id uuid,
  p_expected_version integer,
  p_state jsonb,
  p_visit jsonb,
  p_rewards jsonb,
  p_events jsonb,
  p_meta jsonb
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_visit_id uuid;
begin
  update customers set
    xp                   = (p_state->>'xp')::int,
    game                 = coalesce(p_state->'game', '{}'::jsonb),
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
    version              = version + 1,
    updated_at           = now()
  where id = p_customer_id and cafe_id = p_cafe_id and version = p_expected_version;

  if not found then
    raise exception 'STREAKIFY_CONFLICT' using errcode = 'P0001';
  end if;

  if p_visit is not null and p_visit <> 'null'::jsonb then
    insert into visits (cafe_id, customer_id, created_at, local_date, week_start, source, streak_visits_after, level_after, xp)
    values (
      p_cafe_id, p_customer_id,
      (p_visit->>'createdAt')::timestamptz,
      (p_visit->>'localDate')::date,
      (p_visit->>'weekStart')::date,
      coalesce(p_visit->>'source', 'counter'),
      (p_visit->>'streakVisitsAfter')::int,
      p_visit->>'levelAfter',
      coalesce((p_visit->>'xp')::int, 0)
    )
    returning id into v_visit_id;
  end if;

  insert into rewards (cafe_id, customer_id, kind, level_key, name, value_cents, cost_cents, earned_at, earned_local_date, earned_visit_id)
  select p_cafe_id, p_customer_id, r->>'kind', r->>'levelKey', r->>'name',
         (r->>'valueCents')::int, (r->>'costCents')::int,
         (p_meta->>'createdAt')::timestamptz, (p_meta->>'localDate')::date, v_visit_id
  from jsonb_array_elements(coalesce(p_rewards, '[]'::jsonb)) r;

  insert into streak_events (cafe_id, customer_id, visit_id, type, data, created_at)
  select p_cafe_id, p_customer_id, v_visit_id, e->>'type', e, (p_meta->>'createdAt')::timestamptz
  from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) e;

  return v_visit_id;
end;
$$;

revoke all on function public.apply_customer_update(uuid, uuid, integer, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_customer_update(uuid, uuid, integer, jsonb, jsonb, jsonb, jsonb, jsonb) to service_role;

-- The old check-in function is replaced by apply_customer_update.
drop function if exists public.apply_check_in(uuid, uuid, integer, jsonb, jsonb, jsonb, jsonb);

-- Marks a squad week complete exactly once (safe if two members check in together).
create or replace function public.complete_squad_week(p_squad_id uuid, p_week date)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_streak integer;
begin
  update squads set
    streak_weeks = case when last_complete_week = p_week - 7 then streak_weeks + 1 else 1 end,
    last_complete_week = p_week
  where id = p_squad_id and (last_complete_week is null or last_complete_week < p_week)
  returning streak_weeks into v_streak;
  return v_streak; -- null if this week was already completed
end;
$$;
revoke all on function public.complete_squad_week(uuid, date) from public, anon, authenticated;
grant execute on function public.complete_squad_week(uuid, date) to service_role;
