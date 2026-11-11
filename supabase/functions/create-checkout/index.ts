// Starts a Mollie payment for one course. The price always comes from the database.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const MOLLIE_KEY = Deno.env.get("MOLLIE_API_KEY");
const SITE_URL = Deno.env.get("SITE_URL") || "https://holyhornet.com";

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
  if (!MOLLIE_KEY) return reply(503, { error: "Payments are not switched on yet. Please try again later." });

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

  const res = await fetch("https://api.mollie.com/v2/payments", {
    method: "POST",
    headers: { Authorization: `Bearer ${MOLLIE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: { currency: course.currency.toUpperCase(), value: (course.price_cents / 100).toFixed(2) },
      description: `Holy Hornet course: ${course.title}`.slice(0, 255),
      redirectUrl: `${SITE_URL}/course.html?c=${course_id}&paid=1`,
      cancelUrl: `${SITE_URL}/course.html?c=${course_id}`,
      webhookUrl: `${SUPABASE_URL}/functions/v1/mollie-webhook`,
      metadata: { user_id: user.id, course_id },
    }),
  });
  const payment = await res.json();
  if (!res.ok) {
    console.error("Mollie error", payment.status, payment.detail);
    return reply(502, { error: "The payment page could not be opened. Please try again." });
  }
  return reply(200, { url: payment._links.checkout.href });
});
