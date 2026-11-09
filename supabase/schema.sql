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
  stripe_session_id text unique,
  stripe_payment_intent text,
  amount_cents integer,
  created_at timestamptz not null default now(),
  primary key (user_id, course_id)
);
create index on public.enrollments (stripe_payment_intent);

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
