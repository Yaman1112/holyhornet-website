-- One membership for the whole site (holyhornet.com).
-- Everyone signs up once. New members are "pending" until an admin reviews them on admin.html -> Members,
-- where the admin activates or blocks the account and switches on each simulator and each course separately.
-- Run once in Supabase: SQL Editor -> paste -> Run. Safe to run again. Needs schema.sql, student_details.sql
-- and simulations_access.sql to have been run first.

-- ---------- members ----------
create table if not exists public.members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active', 'blocked')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  admin_note text not null default '' check (length(admin_note) <= 2000)
);
alter table public.members enable row level security;
revoke all on public.members from anon, authenticated;
grant select on public.members to authenticated;
drop policy if exists "own membership" on public.members;
create policy "own membership" on public.members for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ---------- simulators and who may open them ----------
create table if not exists public.simulators (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  title text not null,
  position integer not null default 0
);
alter table public.simulators enable row level security;
revoke all on public.simulators from anon, authenticated;
grant select on public.simulators to anon, authenticated;
drop policy if exists "read simulators" on public.simulators;
create policy "read simulators" on public.simulators for select using (true);
insert into public.simulators (id, title, position) values
  ('perching-uav', 'Perching UAV', 1), ('skyshield', 'SkyShield', 2), ('uav-lab', 'Autonomous UAV Lab', 3),
  ('moving-ecosystem', 'Moving platforms', 4), ('aicn', 'AICN animal intelligence', 5), ('skygrid', 'SkyGrid', 6),
  ('falcon-intelligence', 'Falcon Intelligence', 7), ('skytherm', 'SkyTherm', 8), ('aom-dis', 'AOM-DIS Schiphol', 9),
  ('deepflight', 'DeepFlight AI', 10), ('flapper', 'Flapper', 11), ('counter-uas', 'Counter-UAS Intelligence', 12), ('fms', 'HH-FMS Flight Management', 13), ('quadlab', 'QuadLab Pro', 14)
on conflict (id) do update set title = excluded.title, position = excluded.position;

create table if not exists public.sim_grants (
  user_id uuid not null references auth.users (id) on delete cascade,
  sim_id text not null references public.simulators (id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users (id) on delete set null,
  primary key (user_id, sim_id)
);
alter table public.sim_grants enable row level security;
revoke all on public.sim_grants from anon, authenticated;
grant select on public.sim_grants to authenticated;
drop policy if exists "own grants" on public.sim_grants;
create policy "own grants" on public.sim_grants for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ---------- more about each client ----------
alter table public.student_details add column if not exists account_type text not null default '' check (length(account_type) <= 40);
alter table public.student_details add column if not exists interests text not null default '' check (length(interests) <= 200);
alter table public.student_details add column if not exists use_case text not null default '' check (length(use_case) <= 1000);

-- ---------- carry over everyone who already has an account ----------
insert into public.members (user_id) select id from auth.users on conflict (user_id) do nothing;
update public.members m set status = case a.status when 'approved' then 'active' else a.status end,
  requested_at = a.requested_at, decided_at = a.decided_at, decided_by = a.decided_by
from public.sim_access a where a.user_id = m.user_id and m.decided_at is null and a.status <> 'pending';
update public.members set status = 'active'
where status = 'pending' and user_id in (select user_id from public.enrollments);
-- people approved under the old single switch keep every simulator
insert into public.sim_grants (user_id, sim_id)
select a.user_id, s.id from public.sim_access a cross join public.simulators s where a.status = 'approved'
on conflict do nothing;

-- ---------- new sign-ups: profile, membership request and their answers from the join form ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, full_name) values (new.id, left(coalesce(m ->> 'full_name', ''), 120))
  on conflict (id) do nothing;
  insert into public.members (user_id) values (new.id) on conflict (user_id) do nothing;
  if m ? 'account_type' or m ? 'country' then
    insert into public.student_details (user_id, country, phone, occupation, organisation, experience, goal, heard_from, news_ok, account_type, interests, use_case)
    values (new.id, left(coalesce(m ->> 'country', ''), 80), left(coalesce(m ->> 'phone', ''), 40), left(coalesce(m ->> 'occupation', ''), 120),
      left(coalesce(m ->> 'organisation', ''), 120), left(coalesce(m ->> 'experience', ''), 40), left(coalesce(m ->> 'goal', ''), 40),
      left(coalesce(m ->> 'heard_from', ''), 40), coalesce((m ->> 'news_ok')::boolean, false), left(coalesce(m ->> 'account_type', ''), 40),
      left(coalesce(m ->> 'interests', ''), 200), left(coalesce(m ->> 'use_case', ''), 1000))
    on conflict (user_id) do nothing;
  end if;
  return new;
end $$;

-- ---------- access checks ----------
create or replace function public.member_status() returns text
language sql stable security definer set search_path = '' as $$
  select case
    when auth.uid() is null then 'signed-out'
    when public.is_admin() then 'active'
    else coalesce((select m.status from public.members m where m.user_id = auth.uid()), 'pending')
  end
$$;

-- may the signed-in visitor open this simulator? (used by the site's server-side lock)
create or replace function public.sim_can_open(sim text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or (
    public.member_status() = 'active'
    and exists (select 1 from public.sim_grants g where g.user_id = auth.uid() and g.sim_id = sim))
$$;

-- kept for the older check: 'approved' when the member may open at least one simulator
create or replace function public.sim_status() returns text
language sql stable security definer set search_path = '' as $$
  select case
    when auth.uid() is null then 'signed-out'
    when public.is_admin() then 'approved'
    when public.member_status() = 'blocked' then 'blocked'
    when public.member_status() = 'active' and exists (select 1 from public.sim_grants g where g.user_id = auth.uid()) then 'approved'
    else 'pending'
  end
$$;

-- what the signed-in member has: status, simulators and courses
create or replace function public.my_membership() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'status', public.member_status(),
    'is_admin', public.is_admin(),
    'sims', case when public.is_admin() then (select coalesce(jsonb_agg(s.id order by s.position), '[]') from public.simulators s)
                 when public.member_status() <> 'active' then '[]'::jsonb
                 else (select coalesce(jsonb_agg(g.sim_id), '[]') from public.sim_grants g where g.user_id = auth.uid()) end,
    'courses', (select coalesce(jsonb_agg(e.course_id), '[]') from public.enrollments e where e.user_id = auth.uid()))
$$;

-- blocked members lose course access too
create or replace function public.is_enrolled(c text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.enrollments e where e.user_id = auth.uid() and e.course_id = c)
    and not exists (select 1 from public.members m where m.user_id = auth.uid() and m.status = 'blocked')
$$;

-- ---------- admin ----------
create or replace function public.admin_members()
returns table (user_id uuid, email text, full_name text, status text, requested_at timestamptz, decided_at timestamptz,
  signed_up timestamptz, last_sign_in timestamptz, confirmed boolean, is_admin boolean, admin_note text, details jsonb, sims jsonb, courses jsonb)
language sql stable security definer set search_path = '' as $$
  select u.id, u.email::text, coalesce(p.full_name, ''), coalesce(m.status, 'pending'), coalesce(m.requested_at, u.created_at), m.decided_at,
    u.created_at, u.last_sign_in_at, u.email_confirmed_at is not null, coalesce(p.is_admin, false), coalesce(m.admin_note, ''),
    (select to_jsonb(d) - 'user_id' from public.student_details d where d.user_id = u.id),
    (select coalesce(jsonb_agg(g.sim_id), '[]') from public.sim_grants g where g.user_id = u.id),
    (select coalesce(jsonb_agg(jsonb_build_object('id', e.course_id, 'paid', e.payment_id is not null, 'since', e.created_at)), '[]')
       from public.enrollments e where e.user_id = u.id)
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.members m on m.user_id = u.id
  where public.is_admin()
  order by (coalesce(m.status, 'pending') = 'pending') desc, u.created_at desc
$$;

create or replace function public.admin_set_member(target uuid, new_status text, note text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Only admins can change members'; end if;
  if new_status not in ('pending', 'active', 'blocked') then raise exception 'Unknown status %', new_status; end if;
  insert into public.members (user_id, status, decided_at, decided_by, admin_note)
  values (target, new_status, now(), auth.uid(), coalesce(left(note, 2000), ''))
  on conflict (user_id) do update set status = excluded.status, decided_at = now(), decided_by = auth.uid(),
    admin_note = coalesce(left(note, 2000), public.members.admin_note);
end $$;

create or replace function public.admin_set_note(target uuid, note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Only admins can change members'; end if;
  insert into public.members (user_id, admin_note) values (target, left(coalesce(note, ''), 2000))
  on conflict (user_id) do update set admin_note = excluded.admin_note;
end $$;

-- switch one simulator or one course on or off for a member (switching something on also activates a pending member)
create or replace function public.admin_set_access(target uuid, kind text, item text, allow boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Only admins can change access'; end if;
  if kind = 'sim' then
    if allow then insert into public.sim_grants (user_id, sim_id, granted_by) values (target, item, auth.uid()) on conflict do nothing;
    else delete from public.sim_grants where user_id = target and sim_id = item; end if;
  elsif kind = 'course' then
    if allow then insert into public.enrollments (user_id, course_id, amount_cents) values (target, item, 0) on conflict do nothing;
    else delete from public.enrollments where user_id = target and course_id = item and payment_id is null; end if;
  else raise exception 'Unknown kind %', kind; end if;
  if allow then
    insert into public.members (user_id, status, decided_at, decided_by) values (target, 'active', now(), auth.uid())
    on conflict (user_id) do update set status = 'active', decided_at = now(), decided_by = auth.uid()
    where public.members.status = 'pending';
  end if;
end $$;

revoke execute on function public.member_status(), public.sim_can_open(text), public.my_membership(), public.admin_members(),
  public.admin_set_member(uuid, text, text), public.admin_set_note(uuid, text), public.admin_set_access(uuid, text, text, boolean) from public, anon;
grant execute on function public.member_status(), public.sim_can_open(text), public.my_membership(), public.admin_members(),
  public.admin_set_member(uuid, text, text), public.admin_set_note(uuid, text), public.admin_set_access(uuid, text, text, boolean) to authenticated;

-- If everything above ran, Results shows one row: "Membership installed".
select 'Membership installed' as result where exists (select 1 from pg_proc where proname = 'admin_set_access');
