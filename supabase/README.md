# Turning on the course platform

The pages work without this (they show course outlines and "Enrolment opens soon"). These steps switch on accounts, uploads and payments.

## 1. Supabase (accounts, lessons, files)
1. Create a project at supabase.com. Choose an EU region.
2. Open **SQL Editor**, paste all of `schema.sql`, Run. Then paste all of `seed.sql`, Run.
3. **Authentication → URL Configuration**: set Site URL to `https://holyhornet.com` and add `https://holyhornet.com/account.html` to Redirect URLs.
4. **Project Settings → API**: copy the Project URL and the anon public key into `lms-config.js` at the site root.

## 2. Make yourself the admin
1. Create an account on the site at `account.html` and confirm the email.
2. In **SQL Editor**, run this with your email:

```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'YOUR-EMAIL');
```

`account.html` now shows **Manage courses**, which opens `admin.html`.

## 3. Stripe (payments)
1. Create and activate a Stripe account. Start in test mode.
2. Install the Supabase CLI, then from the site folder:

```bash
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase functions deploy create-checkout
supabase functions deploy stripe-webhook --no-verify-jwt
```

3. In Stripe → **Developers → Webhooks**, add the endpoint `https://YOUR-PROJECT-REF.supabase.co/functions/v1/stripe-webhook` with these events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`.
4. Set the secrets (Stripe secret key, and the webhook's signing secret):

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_... STRIPE_WEBHOOK_SECRET=whsec_... SITE_URL=https://holyhornet.com
```

5. In `admin.html`, set a price on a course. Buy it with Stripe's test card `4242 4242 4242 4242`, confirm the course unlocks, then refund it in Stripe and confirm it locks again.
6. Swap to live keys and create a live webhook the same way.

## Adding material
In `admin.html`: pick a course, pick a lesson, then add text, a Vimeo/YouTube link and files. Files are private and limited to 50 MB each on the free plan, so host long videos on Vimeo with domain-level privacy. Ticking **Free preview** opens a lesson to signed-in visitors who have not bought the course.

To change the starting outlines in bulk, edit `tools/build_courses.py` and run it, then run `seed.sql` again. It only adds what is missing.
