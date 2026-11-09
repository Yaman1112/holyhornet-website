// Stripe calls this after a payment or refund. It is the only thing that grants or removes course access.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const TOLERANCE_SECONDS = 300;

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

function sameText(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function validSignature(header, payload) {
  const parts = (header || "").split(",").map((p) => p.trim().split("="));
  const t = (parts.find(([k]) => k === "t") || [])[1];
  const given = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || !given.length || !(Math.abs(Date.now() / 1000 - Number(t)) <= TOLERANCE_SECONDS)) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${payload}`)));
  return given.some((v) => sameText(v, expected));
}

const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

async function grant(session) {
  const { user_id, course_id } = session.metadata || {};
  if (!user_id || !course_id) throw new Error("Payment without course details: " + session.id);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/enrollments?on_conflict=user_id,course_id`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({
      user_id, course_id,
      stripe_session_id: session.id,
      stripe_payment_intent: session.payment_intent,
      amount_cents: session.amount_total,
    }),
  });
  if (!res.ok) throw new Error("Enrollment failed: " + await res.text());
}

async function revoke(paymentIntent) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/enrollments?stripe_payment_intent=eq.${encodeURIComponent(paymentIntent)}`, { method: "DELETE", headers });
  if (!res.ok) throw new Error("Refund update failed: " + await res.text());
}

Deno.serve(async (req) => {
  const payload = await req.text();
  if (!await validSignature(req.headers.get("Stripe-Signature"), payload)) return new Response("Bad signature", { status: 400 });
  const event = JSON.parse(payload);
  const obj = event.data.object;
  try {
    if (event.type === "checkout.session.completed" && obj.payment_status === "paid") await grant(obj);
    else if (event.type === "checkout.session.async_payment_succeeded") await grant(obj);
    else if (event.type === "charge.refunded" && obj.refunded) await revoke(obj.payment_intent);
  } catch (err) {
    console.error(err);
    return new Response("Try again", { status: 500 });   // Stripe retries
  }
  return new Response("ok");
});
