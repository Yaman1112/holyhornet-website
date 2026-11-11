// Mollie calls this whenever a course payment changes (paid, failed, refunded, charged back).
// It is the only thing that grants or removes course access.
// Mollie sends just a payment id, so nothing in the request is trusted: the payment is looked up
// at Mollie with our own key, and the student and course come from the metadata we set ourselves.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const MOLLIE_KEY = Deno.env.get("MOLLIE_API_KEY");

const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
const cents = (amount) => (amount ? Math.round(parseFloat(amount.value) * 100) : 0);

async function grant(payment) {
  const { user_id, course_id } = payment.metadata || {};
  if (!user_id || !course_id) throw new Error("Payment without course details: " + payment.id);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/enrollments?on_conflict=user_id,course_id`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({ user_id, course_id, payment_id: payment.id, amount_cents: cents(payment.amount) }),
  });
  if (!res.ok) throw new Error("Enrollment failed: " + await res.text());
}

async function revoke(paymentId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/enrollments?payment_id=eq.${encodeURIComponent(paymentId)}`, { method: "DELETE", headers });
  if (!res.ok) throw new Error("Refund update failed: " + await res.text());
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!MOLLIE_KEY) return new Response("Not configured", { status: 503 });

  const form = await req.formData().catch(() => null);
  const id = form && form.get("id") ? String(form.get("id")) : "";
  if (!/^tr_[A-Za-z0-9]+$/.test(id)) return new Response("ok");   // not a payment id: ignore quietly

  const res = await fetch(`https://api.mollie.com/v2/payments/${id}`, { headers: { Authorization: `Bearer ${MOLLIE_KEY}` } });
  if (res.status === 404) return new Response("ok");                 // not one of our payments
  if (!res.ok) return new Response("Try again", { status: 502 });    // Mollie retries
  const payment = await res.json();

  try {
    const paid = cents(payment.amount);
    const takenBack = cents(payment.amountRefunded) + cents(payment.amountChargedBack);
    if (payment.status === "paid" && takenBack >= paid) await revoke(payment.id);
    else if (payment.status === "paid") await grant(payment);
  } catch (err) {
    console.error(err);
    return new Response("Try again", { status: 500 });
  }
  return new Response("ok");
});
