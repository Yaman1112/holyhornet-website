// Starts a Stripe Checkout payment for one course. The price always comes from the database.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const SITE_URL = Deno.env.get("SITE_URL");

const cors = {
  "Access-Control-Allow-Origin": SITE_URL,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const reply = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const db = (path) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } })
    .then((r) => r.json());

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });

  const auth = req.headers.get("Authorization") || "";
  const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: auth } });
  if (!who.ok) return reply(401, { error: "Please sign in first." });
  const user = await who.json();

  const { course_id } = await req.json().catch(() => ({}));
  if (typeof course_id !== "string" || !/^[a-z0-9-]+$/.test(course_id)) return reply(400, { error: "Unknown course." });

  const [course] = await db(`courses?id=eq.${course_id}&published=eq.true&select=id,title,price_cents,currency`);
  if (!course) return reply(404, { error: "Unknown course." });
  if (!course.price_cents) return reply(409, { error: "This course is not on sale yet." });
  const owned = await db(`enrollments?user_id=eq.${user.id}&course_id=eq.${course_id}&select=course_id`);
  if (owned.length) return reply(409, { error: "You already have this course." });

  const form = new URLSearchParams({
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": course.currency,
    "line_items[0][price_data][unit_amount]": String(course.price_cents),
    "line_items[0][price_data][product_data][name]": course.title,
    customer_email: user.email,
    success_url: `${SITE_URL}/course.html?c=${course_id}&paid=1`,
    cancel_url: `${SITE_URL}/course.html?c=${course_id}`,
    "metadata[user_id]": user.id,
    "metadata[course_id]": course_id,
    "payment_intent_data[metadata][user_id]": user.id,
    "payment_intent_data[metadata][course_id]": course_id,
  });
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${STRIPE_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const session = await res.json();
  if (!res.ok) {
    console.error("Stripe error", session.error && session.error.message);
    return reply(502, { error: "The payment page could not be opened. Please try again." });
  }
  return reply(200, { url: session.url });
});
