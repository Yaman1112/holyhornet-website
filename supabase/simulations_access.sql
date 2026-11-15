-- Access to the Simulations page (holyhornet.com/simulations and /projects/*).
-- People sign in, ask for access, and an admin approves or blocks them on admin.html (Simulations tab).
-- Run once in Supabase: SQL Editor -> paste -> Run. Safe to run again.

create table if not exists public.sim_access (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'blocked')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null
);
alter table public.sim_access enable row level security;
revoke all on public.sim_access from anon, authenticated;
grant select on public.sim_access to authenticated;
drop policy if exists "own access" on public.sim_access;
create policy "own access" on public.sim_access for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- The signed-in visitor's status. Admins are always approved. Called by the site's access check on every visit.
create or replace function public.sim_status() returns text
language sql stable security definer set search_path = '' as $$
  select case
    when auth.uid() is null then 'signed-out'
    when public.is_admin() then 'approved'
    else coalesce((select a.status from public.sim_access a where a.user_id = auth.uid()), 'none')
  end
$$;

-- Ask for access (creates a pending request once; never changes a decision already made).
create or replace function public.request_sim_access() returns text
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return 'signed-out'; end if;
  insert into public.sim_access (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  return public.sim_status();
end $$;

-- Admin: everyone who asked, newest first, with their name, email and details.
create or replace function public.admin_sim_requests()
returns table (user_id uuid, email text, full_name text, status text, requested_at timestamptz, decided_at timestamptz, last_sign_in timestamptz, details jsonb)
language sql stable security definer set search_path = '' as $$
  select a.user_id, u.email::text, coalesce(p.full_name, ''), a.status, a.requested_at, a.decided_at, u.last_sign_in_at,
    (select to_jsonb(d) - 'user_id' from public.student_details d where d.user_id = a.user_id)
  from public.sim_access a
  join auth.users u on u.id = a.user_id
  left join public.profiles p on p.id = a.user_id
  where public.is_admin()
  order by (a.status = 'pending') desc, a.requested_at desc
$$;

-- Admin: approve, block or move back to pending.
create or replace function public.admin_set_sim_access(target uuid, new_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Only admins can change access'; end if;
  if new_status not in ('pending', 'approved', 'blocked') then raise exception 'Unknown status %', new_status; end if;
  insert into public.sim_access (user_id, status, decided_at, decided_by)
  values (target, new_status, now(), auth.uid())
  on conflict (user_id) do update set status = excluded.status, decided_at = now(), decided_by = auth.uid();
end $$;

revoke execute on function public.sim_status(), public.request_sim_access(), public.admin_sim_requests(), public.admin_set_sim_access(uuid, text) from public, anon;
grant execute on function public.sim_status(), public.request_sim_access(), public.admin_sim_requests(), public.admin_set_sim_access(uuid, text) to authenticated;

-- If everything above ran, Results shows one row: "Simulations access installed".
select 'Simulations access installed' as result
where exists (select 1 from pg_proc where proname = 'admin_set_sim_access');
