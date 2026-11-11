-- Students list for admin.html (Students tab). Run once in Supabase: SQL Editor -> paste -> Run.
-- Admins only: everyone else gets an empty list. Also part of schema.sql for fresh setups.
create or replace function public.admin_students()
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

-- If everything above ran, Results shows one row: "Students list installed".
select 'Students list installed' as result
where exists (select 1 from pg_proc where proname = 'admin_students');
