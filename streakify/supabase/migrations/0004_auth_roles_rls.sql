-- =============================================================================
-- Streakify — logins, roles, row-level security, audit log
-- Run AFTER 0001, 0002, 0003 (Supabase -> SQL Editor -> paste -> Run).
--
-- WHO CAN DO WHAT (enforced by the DATABASE, not just the screens):
--   admin (you)   : the server acts for you with the service-role key, after
--                   checking your login + 2FA. No database policy needed.
--   owner         : logs in with Supabase Auth. Their own token can only read
--                   rows of THEIR café, can delete a customer of THEIR café
--                   (privacy requests), and can change rewards only through
--                   owner_update_program() which keeps menu & branding locked.
--   everyone else : nothing (no policies = no access).
-- =============================================================================

-- ---- business details per café ---------------------------------------------
alter table public.cafes add column if not exists status text not null default 'active';
alter table public.cafes drop constraint if exists cafes_status_check;
alter table public.cafes add constraint cafes_status_check check (status in ('trial', 'active', 'paused', 'cancelled'));
alter table public.cafes add column if not exists plan_price_cents integer not null default 0;
alter table public.cafes add column if not exists setup_fee_paid boolean not null default false;
alter table public.cafes add column if not exists address text;
alter table public.cafes add column if not exists owner_name text;
alter table public.cafes add column if not exists owner_phone text;

-- ---- profiles: one row per login (linked to Supabase Auth users) ------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  role        text not null check (role in ('admin', 'owner')),
  cafe_id     uuid references public.cafes(id) on delete cascade,
  title       text not null default 'Owner',          -- "Owner", "Manager"...
  created_at  timestamptz not null default now(),
  check ((role = 'admin' and cafe_id is null) or (role = 'owner' and cafe_id is not null))
);
-- There can only ever be ONE admin.
create unique index if not exists profiles_single_admin on public.profiles ((role)) where role = 'admin';
create index if not exists profiles_cafe on public.profiles (cafe_id);
alter table public.profiles enable row level security;
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select to authenticated using (id = auth.uid());
revoke insert, update, delete on public.profiles from anon, authenticated;

-- ---- audit log: who did what, when ----------------------------------------------
create table if not exists public.audit_log (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  actor_id     uuid,
  actor_email  text,
  actor_role   text,
  action       text not null,
  cafe_id      uuid references public.cafes(id) on delete set null,
  details      jsonb not null default '{}'::jsonb,
  ip           text
);
create index if not exists audit_log_at on public.audit_log (at desc);
create index if not exists audit_log_cafe on public.audit_log (cafe_id, at desc);
alter table public.audit_log enable row level security;   -- no policies: server only
revoke all on public.audit_log from anon, authenticated;

-- ---- helper: is the logged-in user an owner of this café? -------------------------
create or replace function public.is_cafe_member(p_cafe uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'owner' and cafe_id = p_cafe);
$$;
revoke all on function public.is_cafe_member(uuid) from public, anon;
grant execute on function public.is_cafe_member(uuid) to authenticated;

-- ---- cafés: owners can READ their café, minus secret columns -----------------
drop policy if exists "owners read own cafe" on public.cafes;
create policy "owners read own cafe" on public.cafes for select to authenticated using (public.is_cafe_member(id));
revoke all on public.cafes from anon, authenticated;
grant select (id, slug, name, custom_domain, timezone, currency, is_demo, active, brand, program, pos_provider, created_at,
              status, plan_price_cents, setup_fee_paid, address, owner_name, owner_phone, owner_email)
  on public.cafes to authenticated;

-- ---- customer data: owners read their café's rows only ----------------------------
drop policy if exists "owners read own customers" on public.customers;
create policy "owners read own customers" on public.customers for select to authenticated using (public.is_cafe_member(cafe_id));
drop policy if exists "owners delete own customers" on public.customers;
create policy "owners delete own customers" on public.customers for delete to authenticated using (public.is_cafe_member(cafe_id));
revoke all on public.customers from anon, authenticated;
grant select, delete on public.customers to authenticated;

drop policy if exists "owners read own visits" on public.visits;
create policy "owners read own visits" on public.visits for select to authenticated using (public.is_cafe_member(cafe_id));
revoke all on public.visits from anon, authenticated;
grant select on public.visits to authenticated;

drop policy if exists "owners read own rewards" on public.rewards;
create policy "owners read own rewards" on public.rewards for select to authenticated using (public.is_cafe_member(cafe_id));
revoke all on public.rewards from anon, authenticated;
grant select on public.rewards to authenticated;

drop policy if exists "owners read own events" on public.streak_events;
create policy "owners read own events" on public.streak_events for select to authenticated using (public.is_cafe_member(cafe_id));
revoke all on public.streak_events from anon, authenticated;
grant select on public.streak_events to authenticated;

drop policy if exists "owners read own squads" on public.squads;
create policy "owners read own squads" on public.squads for select to authenticated using (public.is_cafe_member(cafe_id));
revoke all on public.squads from anon, authenticated;
grant select on public.squads to authenticated;

-- server-only tables
revoke all on public.sms_log, public.job_runs, public.push_subscriptions, public.wallet_registrations from anon, authenticated;

-- ---- owners change rewards ONLY through this function --------------------------------
-- It keeps the menu exactly as the admin set it, never touches logo/colors/
-- subdomain/plan (those are other columns), and writes an audit entry.
create or replace function public.owner_update_program(p_cafe uuid, p_program jsonb)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_email text;
begin
  if not public.is_cafe_member(p_cafe) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select program into v_old from cafes where id = p_cafe for update;
  update cafes
     set program = (p_program - 'menu') || jsonb_build_object('menu', coalesce(v_old->'menu', '{"categories":[],"items":[]}'::jsonb))
   where id = p_cafe;
  select email into v_email from profiles where id = auth.uid();
  insert into audit_log (actor_id, actor_email, actor_role, action, cafe_id, details)
  values (auth.uid(), v_email, 'owner', 'cafe.rewards.update', p_cafe, '{}'::jsonb);
end;
$$;
revoke all on function public.owner_update_program(uuid, jsonb) from public, anon;
grant execute on function public.owner_update_program(uuid, jsonb) to authenticated;
