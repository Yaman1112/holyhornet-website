# Turning on the course platform

The pages work without this (they show course outlines and "Enrolment opens soon"). These steps switch on accounts, uploads and payments.

## 1. Supabase (accounts, lessons, files)
Already set up: project **holy-hornet-lms** (Frankfurt), with `schema.sql`, the course outlines from `seed.sql`
and both payment functions deployed. `lms-config.js` holds its address and public key.

If you ever rebuild it from scratch: create an EU project, run `schema.sql` then `seed.sql` in **SQL Editor**,
and put the new Project URL and anon key into `lms-config.js`.

Still to do once, in the Supabase dashboard: **Authentication → URL Configuration**: set Site URL to
`https://holyhornet.com` and add `https://holyhornet.com/account.html` to Redirect URLs.

## 2. Make yourself the admin
1. Create an account on the site at `account.html` and confirm the email.
2. In **SQL Editor**, run this with your email:

```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'YOUR-EMAIL');
```

`account.html` now shows **Manage courses**, which opens `admin.html`.

The **Students** tab on `admin.html` lists every account with the courses bought, amount paid, Mollie payment id
and lesson progress, and can download it as a CSV. It needs `admin_students.sql` run once in **SQL Editor**
(a project built from the current `schema.sql` already has it).

## 3. Mollie (payments)
Two functions handle payments, both already deployed:
- `create-checkout` opens a Mollie payment for the course price stored in the database.
- `mollie-webhook` is called by Mollie when a payment changes. It looks the payment up at Mollie itself, then
  enrols the student when it is paid and removes access again after a full refund or chargeback.

To switch them on:
1. In the Mollie dashboard, add a website profile for holyhornet.com and finish verification.
2. In Supabase → **Edge Functions → Secrets**, add `MOLLIE_API_KEY` with the **test** key (`test_...`)
   and `SITE_URL` = `https://holyhornet.com`.
3. Buy a course on the site and complete Mollie's test payment page with status "Paid". The course should unlock.
   Refund it in the Mollie dashboard (test mode) and it should lock again.
4. Replace `MOLLIE_API_KEY` with the live key (`live_...`).

Prices are set per course in `admin.html`. Courses are priced in US dollars; iDEAL only works for euro prices,
so cards and PayPal are the methods students will see.

## Adding material
In `admin.html`: pick a course, pick a lesson, then add text, a Vimeo/YouTube link and files. Files are private and limited to 50 MB each on the free plan, so host long videos on Vimeo with domain-level privacy. Ticking **Free preview** opens a lesson to signed-in visitors who have not bought the course.

### Student details ("About you")
After signing in, students are asked for their country, background and goals (they can skip, and edit later from
their account page). Admins see the answers on the dashboard and in the Students CSV. This needs
`student_details.sql` run once in **SQL Editor** (a project built from the current `schema.sql` already has it).
Until it is run, the site simply skips the form.

### Lesson videos and figures
A lesson's text can also hold an animated, narrated Holy Hornet video and figures, drawn by `lms-figures.js`
(no video files to host). In the lesson text, a block that starts with `::video` holds one scene per line,
`figure settings | Scene title | Narration`, and a block that starts with `::figure name settings` (caption on the
next line) places a figure. A setting written `a>b` animates in the video and becomes a slider in a figure.
The figure names are listed at the bottom of `lms-figures.js` (`HHFig.names`).

To change the starting outlines in bulk, edit `tools/build_courses.py` and run it, then run `seed.sql` again. It only adds what is missing.
