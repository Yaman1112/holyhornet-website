-- Holy Hornet LMS: tables, access rules and file storage.
-- Run once in Supabase: SQL Editor -> paste -> Run. Then run seed.sql.

-- ---------- tables ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.courses (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  title text not null,
  summary text not null default '',
  description text not null default '',
  category text not null default '',
  level text not null default '',
  price_cents integer check (price_cents > 0),   -- empty = price not set yet, cannot be bought
  currency text not null default 'eur',
  position integer not null default 0,
  published boolean not null default false
);

create table public.modules (
  id uuid primary key default gen_random_uuid(),
  course_id text not null references public.courses (id) on delete cascade,
  title text not null,
  position integer not null default 0
);
create index on public.modules (course_id);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.modules (id) on delete cascade,
  title text not null,
  position integer not null default 0,
  duration_min integer,
  is_preview boolean not null default false,     -- free sample, open without buying
  published boolean not null default true
);
create index on public.lessons (module_id);

-- Lesson text and video link: only for students who bought the course
create table public.lesson_content (
  lesson_id uuid primary key references public.lessons (id) on delete cascade,
  body text not null default '',
  video_url text not null default ''
);

create table public.lesson_files (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  title text not null,
  storage_path text not null unique,             -- <course id>/<lesson id>/<file name>
  mime_type text not null default '',
  size_bytes bigint not null default 0,
  position integer not null default 0
);
create index on public.lesson_files (lesson_id);

create table public.enrollments (
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id text not null references public.courses (id) on delete cascade,
  payment_id text unique,                        -- Mollie payment id (tr_...)
  amount_cents integer,
  created_at timestamptz not null default now(),
  primary key (user_id, course_id)
);

create table public.progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

-- ---------- new sign-ups get a profile ----------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- access helpers ----------
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false)
$$;

create function public.is_enrolled(c text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.enrollments e where e.user_id = auth.uid() and e.course_id = c)
$$;

create function public.has_lesson_access(l uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or exists (
    select 1 from public.lessons x
    join public.modules m on m.id = x.module_id
    join public.courses c on c.id = m.course_id
    where x.id = l and x.published and c.published
      and (x.is_preview or public.is_enrolled(c.id))
  )
$$;

-- Storage paths are <course id>/<lesson id>/<file name>
create function public.has_file_access(path text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare part text := split_part(path, '/', 2);
begin
  if part !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return public.is_admin();
  end if;
  return public.has_lesson_access(part::uuid);
end $$;

-- The trigger function is never called directly; the access helpers only matter to signed-in users
-- (is_admin stays open to visitors because the public catalogue policies use it).
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.is_enrolled(text) from public, anon;
revoke execute on function public.has_lesson_access(uuid) from public, anon;
revoke execute on function public.has_file_access(text) from public, anon;
grant execute on function public.is_enrolled(text), public.has_lesson_access(uuid), public.has_file_access(text) to authenticated;

-- ---------- row level security ----------
alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.modules enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_content enable row level security;
alter table public.lesson_files enable row level security;
alter table public.enrollments enable row level security;
alter table public.progress enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant select on public.courses, public.modules, public.lessons to anon, authenticated;
grant select on public.profiles, public.lesson_content, public.lesson_files, public.enrollments to authenticated;
grant select, insert, delete on public.progress to authenticated;
grant insert, update, delete on public.courses, public.modules, public.lessons,
  public.lesson_content, public.lesson_files to authenticated;   -- limited to admins by the policies below

-- profiles: read your own; nobody can make themselves an admin from the site
create policy "own profile" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- outlines are public once published, admins see and edit everything
create policy "read courses" on public.courses for select using (published or public.is_admin());
create policy "admin courses" on public.courses for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "read modules" on public.modules for select using (
  public.is_admin() or exists (select 1 from public.courses c where c.id = course_id and c.published));
create policy "admin modules" on public.modules for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "read lessons" on public.lessons for select using (
  public.is_admin() or (published and exists (
    select 1 from public.modules m join public.courses c on c.id = m.course_id
    where m.id = module_id and c.published)));
create policy "admin lessons" on public.lessons for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- paid material
create policy "read content" on public.lesson_content for select to authenticated
  using (public.has_lesson_access(lesson_id));
create policy "admin content" on public.lesson_content for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "read files" on public.lesson_files for select to authenticated
  using (public.has_lesson_access(lesson_id));
create policy "admin files" on public.lesson_files for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- enrollments are written only by the payment webhook (service key), never from the browser
create policy "own enrollments" on public.enrollments for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "read progress" on public.progress for select to authenticated using (user_id = auth.uid());
create policy "add progress" on public.progress for insert to authenticated
  with check (user_id = auth.uid() and public.has_lesson_access(lesson_id));
create policy "remove progress" on public.progress for delete to authenticated using (user_id = auth.uid());

-- ---------- students list for admin.html ----------
-- The same function is in admin_students.sql, for projects set up before it existed.
create function public.admin_students()
returns table (user_id uuid, email text, full_name text, signed_up timestamptz, last_sign_in timestamptz, is_admin boolean, courses jsonb)
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
      where e.user_id = u.id), '[]'::jsonb)
  from auth.users u left join public.profiles p on p.id = u.id
  where public.is_admin()
  order by u.created_at desc
$$;
revoke execute on function public.admin_students() from public, anon;
grant execute on function public.admin_students() to authenticated;

-- ---------- "About you" details (also in student_details.sql) ----------

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

-- ---------- private file storage (PDFs, slides, short videos) ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('course-files', 'course-files', false, 52428800);   -- 50 MB, the Supabase free-plan limit per file

create policy "read course files" on storage.objects for select to authenticated
  using (bucket_id = 'course-files' and public.has_file_access(name));
create policy "admin add files" on storage.objects for insert to authenticated
  with check (bucket_id = 'course-files' and public.is_admin());
create policy "admin change files" on storage.objects for update to authenticated
  using (bucket_id = 'course-files' and public.is_admin());
create policy "admin remove files" on storage.objects for delete to authenticated
  using (bucket_id = 'course-files' and public.is_admin());
