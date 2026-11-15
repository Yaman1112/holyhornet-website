// Guards the Simulations page and every simulator under /projects/ (see _routes.json for the paths this runs on).
//  /simulations       signed-in members see the full page (each card shows whether it is open to them);
//                     visitors who are not signed in see the public preview (sim-preview.html).
//  /projects/<sim>/   only members the admin has given that simulator to (and admins) get through
//                     (supabase/membership.sql: sim_can_open). Everyone else goes back to /simulations.
// The site's own pages (lms.js) keep the visitor's Supabase access token in the hh_at cookie.

const SUPABASE_URL = 'https://fmeyjkcdzpfarcyrdpon.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtZXlqa2NkenBmYXJjeXJkcG9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ0MTIyNzcsImV4cCI6MjEwOTk4ODI3N30.EWBE4OZO5McTc7mW2ji0Svl3Kj2rQ3gMKxseNT_p_Gw';

const seen = new Map(); // "token|question" -> { answer, until }: avoids asking Supabase for every image and script

function cookie(request, name) {
  const all = request.headers.get('Cookie') || '';
  const hit = all.split(/;\s*/).find((c) => c.startsWith(name + '='));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : '';
}

async function ask(token, fn, body, keep) {
  const key = token + '|' + fn + '|' + JSON.stringify(body);
  const now = Date.now();
  const hit = seen.get(key);
  if (hit && hit.until > now) return hit.answer;
  let answer = null;
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (res.ok) answer = await res.json();
  } catch (e) {
    answer = null;
  }
  if (seen.size > 4000) seen.clear();
  if (keep(answer)) seen.set(key, { answer, until: now + 60000 });
  return answer;
}

function isPage(path) {
  return path === '/simulations' || path === '/simulations.html' || path === '/simulations/';
}

function noStore(res, extra) {
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', 'private, no-store');
  if (extra) Object.keys(extra).forEach((k) => out.headers.set(k, extra[k]));
  return out;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = cookie(request, 'hh_at');

  if (isPage(url.pathname)) {
    const status = token ? await ask(token, 'member_status', {}, (a) => typeof a === 'string' && a !== 'signed-out') : null;
    if (typeof status === 'string' && status !== 'signed-out') return noStore(await context.next(), { 'X-Robots-Tag': 'noindex' });
    const preview = await env.ASSETS.fetch(new Request(new URL('/sim-preview', url.origin), request));
    return noStore(preview);
  }

  const m = /^\/projects\/([a-z0-9-]+)(\/|$)/.exec(url.pathname);
  const sim = m ? m[1] : '';
  const open = token && sim ? await ask(token, 'sim_can_open', { sim }, (a) => a === true) : false;
  if (open === true) return noStore(await context.next(), { 'X-Robots-Tag': 'noindex' });

  return new Response(null, {
    status: 302,
    headers: { Location: '/simulations' + (sim ? '?locked=' + encodeURIComponent(sim) : ''), 'Cache-Control': 'no-store' }
  });
}
