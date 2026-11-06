-- =============================================================================
-- Streakify — phases 2 to 6
-- Run AFTER 0001_init.sql (Supabase -> SQL Editor -> paste -> Run).
-- =============================================================================

-- Café owner login + where to email the monthly report (phase 3/4)
alter table public.cafes add column if not exists owner_email text;
alter table public.cafes add column if not exists owner_password_hash text;

-- Reward history by café calendar day (dashboard + reports)
alter table public.rewards add column if not exists earned_local_date date;
update public.rewards r set earned_local_date = v.local_date
  from public.visits v where r.earned_visit_id = v.id and r.earned_local_date is null;
update public.rewards set earned_local_date = (earned_at at time zone 'UTC')::date where earned_local_date is null;
create index if not exists rewards_cafe_earned on public.rewards (cafe_id, earned_local_date);

-- Texts we sent (phase 5). `dedupe_key` stops the same reminder going out twice.
create table if not exists public.sms_log (
  id           bigint generated always as identity primary key,
  cafe_id      uuid not null references public.cafes(id) on delete cascade,
  customer_id  uuid,
  phone_e164   text not null,
  dedupe_key   text not null,
  body         text not null,
  status       text not null,            -- sent | dry_run | failed
  provider_id  text,
  error        text,
  created_at   timestamptz not null default now(),
  unique (cafe_id, dedupe_key)
);
alter table public.sms_log enable row level security;

-- Monthly jobs that must only run once per café per month (reports, leaderboard prize)
create table if not exists public.job_runs (
  cafe_id    uuid not null references public.cafes(id) on delete cascade,
  job        text not null,
  period     text not null,              -- e.g. "2026-11"
  created_at timestamptz not null default now(),
  primary key (cafe_id, job, period)
);
alter table public.job_runs enable row level security;

-- Same as before, now also records the café calendar day on each reward.
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

  insert into rewards (cafe_id, customer_id, kind, level_key, name, value_cents, cost_cents, earned_at, earned_local_date, earned_visit_id)
  select p_cafe_id, p_customer_id, r->>'kind', r->>'levelKey', r->>'name',
         (r->>'valueCents')::int, (r->>'costCents')::int,
         (p_visit->>'createdAt')::timestamptz, (p_visit->>'localDate')::date, v_visit_id
  from jsonb_array_elements(coalesce(p_rewards, '[]'::jsonb)) r;

  insert into streak_events (cafe_id, customer_id, visit_id, type, data, created_at)
  select p_cafe_id, p_customer_id, v_visit_id, e->>'type', e, (p_visit->>'createdAt')::timestamptz
  from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) e;

  return v_visit_id;
end;
$$;

revoke all on function public.apply_check_in(uuid, uuid, integer, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_check_in(uuid, uuid, integer, jsonb, jsonb, jsonb, jsonb) to service_role;
