-- "About you" details students fill in after signing in, shown to admins on admin.html.
-- Run once in Supabase: SQL Editor -> paste -> Run. Safe to run again.

create table if not exists public.student_details (
  user_id uuid primary key references auth.users (id) on delete cascade,
  country text not null default '' check (length(country) <= 80),
  city text not null default '' check (length(city) <= 80),
  phone text not null default '' check (length(phone) <= 40),
  occupation text not null default '' check (length(occupation) <= 120),
  organisation text not null default '' check (length(organisation) <= 120),
  experience text not null default '' check (length(experience) <= 40),
  goal text not null default '' check (length(goal) <= 40),
  heard_from text not null default '' check (length(heard_from) <= 40),
  notes text not null default '' check (length(notes) <= 1000),
  news_ok boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.student_details enable row level security;
revoke all on public.student_details from anon, authenticated;
grant select, insert, update on public.student_details to authenticated;

-- students read and edit only their own row; admins read everyone's
drop policy if exists "own details read" on public.student_details;
drop policy if exists "own details insert" on public.student_details;
drop policy if exists "own details update" on public.student_details;
create policy "own details read" on public.student_details for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy "own details insert" on public.student_details for insert to authenticated
  with check (user_id = auth.uid());
create policy "own details update" on public.student_details for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- students may correct their own name (only that column, so nobody can make themselves an admin)
grant update (full_name) on public.profiles to authenticated;
drop policy if exists "own name" on public.profiles;
create policy "own name" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
alter table public.profiles drop constraint if exists profiles_full_name_length;
alter table public.profiles add constraint profiles_full_name_length check (length(full_name) <= 120);

-- admin student list, now with the details
drop function if exists public.admin_students();
create function public.admin_students()
returns table (user_id uuid, email text, full_name text, signed_up timestamptz, last_sign_in timestamptz, is_admin boolean, courses jsonb, details jsonb)
language sql stable security definer set search_path = '' as $$
  select u.id, u.email::text, coalesce(p.full_name, ''), u.created_at, u.last_sign_in_at, coalesce(p.is_admin, false),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'course_id', e.course_id, 'title', c.title, 'enrolled_at', e.created_at,
        'amount_cents', e.amount_cents, 'currency', c.currency, 'payment_id', e.payment_id,
        'done', (select count(*) from public.progress pr
                 join public.lessons l on l.id = pr.lesson_id
                 join public.modules m on m.id = l.module_id
                 where pr.user_id = u.id and m.course_id = e.course_id and l.published),
        'total', (select count(*) from public.lessons l
                  join public.modules m on m.id = l.module_id
                  where m.course_id = e.course_id and l.published)
      ) order by e.created_at)
      from public.enrollments e join public.courses c on c.id = e.course_id
      where e.user_id = u.id), '[]'::jsonb),
    (select to_jsonb(d) - 'user_id' from public.student_details d where d.user_id = u.id)
  from auth.users u left join public.profiles p on p.id = u.id
  where public.is_admin()
  order by u.created_at desc
$$;
revoke execute on function public.admin_students() from public, anon;
grant execute on function public.admin_students() to authenticated;

-- If everything above ran, Results shows one row: "Student details installed".
select 'Student details installed' as result
where exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'student_details');
