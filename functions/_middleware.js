// Locks the Simulations page and every simulator under /projects/ (see _routes.json for the paths this runs on).
// A visitor gets through only when they are signed in and an admin has approved them (supabase/simulations_access.sql).
// The site's own pages (lms.js) keep the visitor's Supabase access token in the hh_at cookie.

const SUPABASE_URL = 'https://fmeyjkcdzpfarcyrdpon.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtZXlqa2NkenBmYXJjeXJkcG9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ0MTIyNzcsImV4cCI6MjEwOTk4ODI3N30.EWBE4OZO5McTc7mW2ji0Svl3Kj2rQ3gMKxseNT_p_Gw';

const seen = new Map(); // token -> { status, until }: avoids asking Supabase for every image and script

function cookie(request, name) {
  const all = request.headers.get('Cookie') || '';
  const hit = all.split(/;\s*/).find((c) => c.startsWith(name + '='));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : '';
}

async function statusOf(token) {
  const now = Date.now();
  const hit = seen.get(token);
  if (hit && hit.until > now) return hit.status;
  let status = 'signed-out';
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/sim_status', {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: '{}'
    });
    if (res.ok) status = String(await res.json());
  } catch (e) {
    status = 'error';
  }
  if (seen.size > 2000) seen.clear();
  if (status === 'approved') seen.set(token, { status, until: now + 60000 });
  return status;
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const token = cookie(context.request, 'hh_at');
  const status = token ? await statusOf(token) : 'signed-out';

  if (status === 'approved') {
    const res = await context.next();
    const out = new Response(res.body, res);
    out.headers.set('Cache-Control', 'private, no-store');
    out.headers.set('X-Robots-Tag', 'noindex');
    return out;
  }
  const next = url.pathname + url.search;
  return new Response(null, {
    status: 302,
    headers: { Location: '/access?next=' + encodeURIComponent(next), 'Cache-Control': 'no-store' }
  });
}
