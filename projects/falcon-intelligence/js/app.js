// Shell, router, login, overview, falcon list, live map, health observations.
import { S, $, $$, api, esc, can, toast, guard, dt, ago, dur, cleanup, every, prov, provLegend, lvl, state, makeMap, drawZones, dotIcon,
  STATE_COLOR, hydrateImages, formModal, logout, kmh, num, setTheme } from "./core.js";
import { startEngine } from "./engine.js";
import { falconView } from "./falcon.js";
import { flightView } from "./flight.js";
import { devicesView, breedingView, visionLabView, reportsView } from "./ops.js";
import { flightsHub, trainingHub, feedingHub, recoveryView, shareView, assistantView, orgView, settingsView, weatherCard } from "./views2.js";

// [route, label, permission]
const NAV = [["overview", "Overview"], ["falcons", "My Falcons", "falcon.read"], ["map", "Live Tracking", "telemetry.read"], ["flights", "Flight Intelligence", "telemetry.read"],
  ["training", "Training Management", "falcon.read"], ["alerts", "Health & Wellness", "health.read"], ["feeding", "Feeding & Weight", "health.read"],
  ["breeding", "Breeding", "breeding.read"], ["recovery", "Recovery Center", "recovery.read"], ["assistant", "AI Assistant"], ["devices", "Devices", "device.read"],
  ["vision", "Vision Lab", "vision.use"], ["reports", "Reports", "report"], ["org", "Organizations"], ["settings", "Settings"]];

export function alertCard(a, { withFalcon = false, onChange } = {}) {
  const el = document.createElement("div");
  el.className = "alert";
  const canClin = can("clinical.write"), canW = can("health.write");
  el.innerHTML = `
    <div class="row"><span>${lvl(a.level)}</span><b class="grow">${withFalcon ? `<a href="#/falcon/${a.falcon_id}/health">${esc(a.falcon_name)}</a> — ` : ""}${esc(a.level_name)}</b>
      <span class="badge">${esc(a.status)}</span></div>
    <div style="margin-top:4px">${esc(a.title)}</div>
    <h3>Supporting observations</h3><ul>${a.observations.map((o) => `<li>${esc(o.text)} ${prov(o.provenance)}</li>`).join("")}</ul>
    <div class="small muted">Period ${dt(a.period_start)} → ${dt(a.period_end)} · Confidence ${(a.confidence * 100).toFixed(0)}% · Updated ${dt(a.updated)}</div>
    <div class="note"><b>Data limitations.</b> ${esc(a.limitations)}</div>
    <div class="note"><b>Recommended human follow-up.</b> ${esc(a.follow_up)}</div>
    ${(a.annotations || []).map((n) => `<div class="small">↳ <b>${esc(n.user)}</b> (${esc(n.role)}, ${dt(n.ts)}): ${esc(n.note)} ${prov(n.provenance)}</div>`).join("")}
    ${canW && a.status !== "resolved" ? `<div class="row" style="margin-top:8px">
      <button class="sm" data-act="note">${canClin ? "Add veterinary annotation" : "Add note"}</button>
      ${a.status === "open" ? `<button class="sm" data-act="acknowledged">Acknowledge</button>` : ""}
      ${(a.level < 3 || canClin) && a.status !== "reviewed" ? `<button class="sm" data-act="reviewed">Mark reviewed</button>` : ""}
      ${(a.level < 3 || canClin) ? `<button class="sm" data-act="dismissed">Dismiss</button>` : `<span class="small muted">Level ${a.level} observations are closed by a veterinary professional.</span>`}
    </div>` : ""}`;
  $$("[data-act]", el).forEach((b) => b.onclick = guard(async () => {
    if (b.dataset.act === "note") {
      formModal("Annotate observation", [{ name: "note", label: "Note", type: "textarea", required: true }],
        async (v) => { await api(`/alerts/${a.id}/annotate`, { body: v }); onChange?.(); });
    } else { await api(`/alerts/${a.id}/status`, { body: { status: b.dataset.act } }); onChange?.(); }
  }));
  return el;
}

async function loginView(main) {
  const d = await api("/auth/demo-accounts");
  main.innerHTML = `<div class="login"><div class="brand" style="text-align:center;padding-bottom:18px"><b style="font-size:22px">FALCON INTELLIGENCE</b><span>Powered by HolyHornet</span></div>
    <div class="card"><h2>Sign in</h2>
      <form id="lf"><label>Email</label><input name="email" type="email" autocomplete="username" required>
      <label>Password</label><input name="password" type="password" autocomplete="current-password" required>
      <div style="margin-top:14px"><button class="primary" style="width:100%">Sign in</button></div></form>
      ${d.demo ? `<h3 style="margin-top:22px">Demo workspace — choose a role</h3>
        <div class="small muted" style="margin-bottom:8px">All records in this workspace are synthetic. Each role sees and can do different things.</div>
        ${d.accounts.map((a) => `<button data-demo="${a.id}" style="width:100%;text-align:left;margin:3px 0"><b>${esc(a.role.replace("_", " "))}</b> — ${esc(a.name)} <span class="muted small">· ${esc(a.title || "")}</span></button>`).join("")}` : ""}
    </div></div>`;
  const done = (r) => { S.token = r.token; localStorage.setItem("fi_token", r.token); S.user = r.user; S.meta = null;
    location.hash = sessionStorage.getItem("fi_next") || "#/overview"; sessionStorage.removeItem("fi_next"); };
  $("#lf").onsubmit = guard(async (e) => { e.preventDefault(); const fd = new FormData(e.target);
    done(await api("/auth/login", { body: { email: fd.get("email"), password: fd.get("password") } })); });
  $$("[data-demo]").forEach((b) => b.onclick = guard(async () => done(await api("/auth/demo-login", { body: { user_id: +b.dataset.demo } }))));
}

async function overviewView(main) {
  const [o, notes, w] = await Promise.all([api("/overview"), api("/notifications"), can("falcon.read") ? api("/weather").catch(() => null) : null]);
  const stat = (v, label, link) => `<div class="card stat"${link ? ` data-go="${link}" style="cursor:pointer"` : ""}><b>${v}</b><span>${label}</span></div>`;
  const batt = (p) => p == null ? `<span class="muted">not reported</span>` : `<span style="display:inline-block;width:70px;height:7px;background:var(--panel2);border-radius:4px;vertical-align:middle;margin-right:6px"><span style="display:block;height:7px;border-radius:4px;width:${Math.max(3, p)}%;background:${p <= 15 ? "var(--bad)" : p <= 30 ? "var(--warn)" : "var(--ok)"}"></span></span>${num(p, 0)}%`;
  main.innerHTML = `<div class="head"><div><h1>Overview</h1><div class="muted">${esc(S.user.name)} · ${esc(S.user.title || S.user.role)} · updated ${dt(o.generated)}</div></div>${provLegend()}</div>
    <div class="grid g4" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
      ${stat(o.falcons, "registered falcons", can("falcon.read") ? "#/falcons" : "")}
      ${o.tracking ? stat(`${o.tracking.live} / ${o.tracking.with_tracker}`, "trackers reporting live", "#/map") : ""}
      ${o.flights_7d != null ? stat(o.flights_7d, "tracked flights, last 7 days", "#/flights") : ""}
      ${stat(`${o.training_7d.completed} / ${o.training_7d.sessions}`, `sessions completed, last 7 days · ${o.training_7d.birds_trained} birds`, can("falcon.read") ? "#/training" : "")}
      ${o.alerts ? stat(o.alerts.length, "open health observations (level 2+)", "#/alerts") : ""}
      ${o.open_recovery_cases ? stat(o.open_recovery_cases.length, "open recovery cases", "#/recovery") : ""}
      ${o.pending_fit_reviews != null ? stat(o.pending_fit_reviews, "tracker fits awaiting professional review", "#/devices") : ""}
    </div>
    ${o.open_recovery_cases?.length ? `<div class="note bad" style="margin-top:14px"><b>Open recovery cases:</b> ${o.open_recovery_cases.map((c) => `<a href="#/recovery/${c.id}">${esc(c.name)}</a> (opened ${dt(c.opened_at)})`).join(" · ")}</div>` : ""}
    <div class="grid g2" style="margin-top:14px">
      ${o.latest_locations ? `<div class="card"><h2>Latest locations</h2><div class="scroll"><table><tr><th>Falcon</th><th>Status</th><th>Last valid fix</th><th>Speed</th></tr>
        ${o.latest_locations.map((l) => `<tr class="click" data-go="#/falcon/${l.falcon_id}/tracking"><td><b>${esc(l.name)}</b></td><td>${state(l.state, l.label)}</td><td>${l.position ? ago(l.age_s) : "—"}</td><td>${l.state === "live" && l.position?.speed_mps != null ? kmh(l.position.speed_mps) : "—"}</td></tr>`).join("") || `<tr><td colspan="4" class="muted">No trackers assigned.</td></tr>`}</table></div></div>` : ""}
      ${o.devices ? `<div class="card"><h2>Device battery levels ${prov("measured")}</h2><div class="scroll"><table><tr><th>Tracker</th><th>Falcon</th><th>Battery at last report</th><th>Last report</th></tr>
        ${o.devices.map((d) => `<tr><td>${esc(d.serial)}</td><td>${esc(d.falcon || "unassigned")}</td><td class="nowrap">${batt(d.battery_pct)}</td><td class="small">${d.last_seen ? dt(d.last_seen) : "never"}</td></tr>`).join("")}</table></div></div>` : ""}
      ${o.recent_flights ? `<div class="card"><h2>Recent flight sessions</h2><div class="scroll"><table><tr><th>Start</th><th>Falcon</th><th>Duration</th><th>Max height</th></tr>
        ${o.recent_flights.map((f) => `<tr class="click" data-go="#/flight/${f.id}"><td class="nowrap">${dt(f.start)}${f.simulated ? ` <span class="badge">simulated</span>` : ""}</td><td>${esc(f.name)}</td><td>${dur(f.duration_s)}</td><td>${f.max_height_m != null ? num(f.max_height_m, 0) + " m" : "—"}</td></tr>`).join("") || `<tr><td colspan="4" class="muted">No flights recorded.</td></tr>`}</table></div></div>` : ""}
      ${w ? weatherCard(w) : ""}
      <div class="card"><div class="row"><h2 class="grow">Recent alerts &amp; notifications</h2><button class="sm" id="readall">Mark all read</button></div>
        <div class="scroll">${notes.length ? notes.slice(0, 30).map((n) => `<div style="padding:7px 0;border-bottom:1px solid var(--line);opacity:${n.read ? .55 : 1}">
          <div><span class="dot" style="background:${{ urgent: "var(--bad)", warning: "var(--warn)", notice: "var(--info)" }[n.severity] || "var(--muted)"}"></span>${n.falcon_id && can("falcon.read") ? `<a href="#/falcon/${n.falcon_id}">${esc(n.title)}</a>` : esc(n.title)}</div>
          <div class="small muted">${esc(n.body || "")} · ${dt(n.ts)}</div></div>`).join("") : `<div class="muted">No notifications.</div>`}</div></div>
    </div>
    ${o.alerts ? `<h2 style="margin-top:22px">Health observations needing attention</h2><div id="al"></div>` : ""}`;
  $$("[data-go]", main).forEach((r) => r.onclick = () => { if (r.dataset.go) location.hash = r.dataset.go; });
  $("#readall").onclick = guard(async () => { await api("/notifications/read", { body: {} }); route(); });
  const al = $("#al");
  if (al) { o.alerts.slice(0, 5).forEach((a) => al.append(alertCard(a, { withFalcon: true, onChange: route })));
    if (!o.alerts.length) al.innerHTML = `<div class="card muted">No open observations above level 1.</div>`; }
}

async function falconsView(main) {
  const fs = await api("/falcons");
  main.innerHTML = `<div class="head"><div><h1>My Falcons</h1><div class="muted">Digital identity and record for every registered bird</div></div>
    ${can("falcon.write") ? `<button class="primary" id="add">Register falcon</button>` : ""}</div>
    <div class="grid g3">${fs.map((f) => `<div class="card fcard" data-go="#/falcon/${f.id}">
      ${f.photo_id ? `<img data-att="${f.photo_id}" alt="">` : `<div class="ph"></div>`}
      <div style="min-width:0"><b>${esc(f.name)}</b> ${can("health.read") && f.alert_level > 1 ? lvl(f.alert_level) : ""}<div class="small muted">${esc(f.code)}</div>
      <div class="small">${esc(f.species || "Species not recorded")} · ${esc(f.sex)} · ${esc(f.category)}</div>
      <div style="margin-top:4px">${state(f.position_state, f.position_label)}${f.shared_with_me ? ` <span class="badge">shared with you</span>` : ""}</div></div></div>`).join("")}</div>`;
  hydrateImages(main);
  $$("[data-go]").forEach((r) => r.onclick = () => { location.hash = r.dataset.go; });
  const add = $("#add");
  if (add) add.onclick = () => formModal("Register falcon", [
    { name: "name", label: "Name", required: true },
    { name: "species_id", label: "Species profile", type: "select", options: [["", "— not recorded —"], ...S.meta.species.map((s) => [s.id, s.common_name])] },
    { name: "sex", label: "Sex", type: "select", options: ["unknown", "female", "male"] },
    { name: "hatch_date", label: "Hatch date (or estimate)", type: "date" },
    { name: "age_is_estimate", label: "Date is an estimate", type: "checkbox" },
    { name: "category", label: "Category", type: "select", options: ["hunting", "racing", "breeding", "display", "juvenile"] },
    { name: "origin", label: "Origin" }, { name: "breeder", label: "Breeder" },
    ...(can("identity.write") ? [{ name: "owner_name", label: "Owner" }, { name: "ring_number", label: "Ring / band number" }, { name: "microchip", label: "Microchip" }, { name: "passport_no", label: "Passport number" }] : []),
  ], async (v) => { const f = await api("/falcons", { body: v }); toast("Falcon registered"); location.hash = `#/falcon/${f.id}`; },
  { intro: `<div class="small muted">Registering a falcon here does not replace any legal registration, passport or permit.</div>` });
}

async function mapView(main) {
  main.innerHTML = `<div class="head"><div><h1>Live Tracking</h1><div class="muted">Most recently reported position of every tracked falcon <span id="feed" class="badge"></span></div></div></div>
    <div class="grid g21"><div id="map" class="map tall"></div><div><div id="list"></div>
    <div class="note">A stale or missing position only means no report was received. It is not evidence that a falcon is lost.</div>
    <div class="small muted"><span class="dot" style="background:#d2a24c"></span>training zone <span class="dot" style="background:#5fb37a;margin-left:8px"></span>home <span class="dot" style="background:#e06a52;margin-left:8px"></span>notification boundary</div></div></div>`;
  const map = makeMap($("#map"));
  const layers = L.layerGroup().addTo(map);
  let fitted = false;
  const draw = (o) => {
    if (!document.body.contains($("#list"))) return;
    layers.clearLayers();
    drawZones(layers, o.zones);
    o.recent_flights.forEach((f) => L.circleMarker(f.launch, { radius: 3, color: "#d2a24c", weight: 1 }).bindTooltip("Launch — flight " + f.id).addTo(layers));
    const pts = [];
    $("#list").innerHTML = o.falcons.map((f) => `<div class="card" style="margin-bottom:8px"><div class="row"><b class="grow"><a href="#/falcon/${f.falcon_id}/tracking">${esc(f.name)}</a></b>${state(f.state, f.label)}</div>
      ${f.position ? `<div class="small muted">Last fix ${ago(f.age_s)}${f.position.speed_mps != null && f.state === "live" ? ` · ${kmh(f.position.speed_mps)}` : ""}${f.position.accuracy_m ? ` · ±${f.position.accuracy_m} m (estimate)` : ""}${f.simulated ? " · simulated" : ""}</div>` : `<div class="small muted">${esc(f.explain)}</div>`}
      ${f.device ? `<div class="small muted">Tracker ${esc(f.device.serial)} · battery ${f.device.battery_pct != null ? num(f.device.battery_pct, 0) + "%" : "—"}</div>` : ""}</div>`).join("");
    o.falcons.filter((f) => f.position).forEach((f) => {
      const p = [f.position.lat, f.position.lon];
      pts.push(p);
      if (f.live_flight) L.polyline(f.live_flight.track, { color: "#5fb37a", weight: 3 }).addTo(layers);
      L.marker(p, { icon: dotIcon(STATE_COLOR[f.state] || "#999", f.state === "live"), opacity: f.state === "stale" ? 0.75 : 1 })
        .bindTooltip(`<b>${esc(f.name)}</b><br>${esc(f.label)} · ${ago(f.age_s)}`, { permanent: true, direction: "top", offset: [0, -8] }).addTo(layers)
        .on("click", () => { location.hash = `#/falcon/${f.falcon_id}/tracking`; });
    });
    if (!fitted && pts.length) { map.fitBounds(L.latLngBounds(pts).pad(0.5), { maxZoom: 14 }); fitted = true; }
  };
  draw(await api("/tracking/overview"));
  // live push over WebSocket; falls back to polling if the socket cannot be opened
  const poll = () => { $("#feed").textContent = "polling every 3 s"; every(3000, async () => draw(await api("/tracking/overview"))); };
  if (window.FI_ENGINE === "browser") poll();      // no server to push from in the browser edition
  else try {
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws/live?token=${encodeURIComponent(S.token)}`);
    let opened = false;
    ws.onopen = () => { opened = true; $("#feed").textContent = "live push"; };
    ws.onmessage = (e) => draw(JSON.parse(e.data));
    ws.onclose = () => { if (!opened && document.body.contains($("#list"))) poll(); };
    S.closers.push(() => ws.close());
  } catch { poll(); }
}

async function alertsView(main) {
  const all = await api("/alerts?status=active");
  main.innerHTML = `<div class="head"><div><h1>Health &amp; Wellness</h1><div class="muted">Automated observations for human follow-up — never a diagnosis</div></div>${provLegend()}</div>
    <div class="card" style="margin-bottom:14px"><div class="row">${Object.entries(S.meta.alert_levels).map(([n, name]) => `<span>${lvl(+n)} <span class="small">${esc(name)}</span></span>`).join("")}</div></div><div id="al"></div>`;
  all.forEach((a) => $("#al").append(alertCard(a, { withFalcon: true, onChange: route })));
}

// --- router ---------------------------------------------------------------------------------------
const ROUTES = { overview: overviewView, dashboard: overviewView, falcons: falconsView, map: mapView, flights: flightsHub, training: trainingHub, alerts: alertsView,
  feeding: feedingHub, breeding: breedingView, recovery: recoveryView, assistant: assistantView, devices: devicesView, vision: visionLabView,
  reports: reportsView, org: orgView, settings: settingsView, admin: settingsView, falcon: falconView, flight: flightView };

export async function route() {
  cleanup();
  $("#modal-root").innerHTML = "";
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  let name = parts[0] || "overview";
  const app = $("#app");
  if (name === "share") return shareView(app, parts[1] || "");      // public recovery link: no sign-in
  if (name === "login" || !S.token) {
    if (name !== "login") { sessionStorage.setItem("fi_next", location.hash); location.hash = "#/login"; return; }
    app.innerHTML = `<div id="main"></div>`;
    return guard(loginView)($("#main"));
  }
  try {
    if (!S.user) S.user = await api("/me");
    if (!S.meta) S.meta = await api("/meta");
  } catch { return; }
  if (name === "id") {   // QR scan target
    try { const r = await api(`/id/${encodeURIComponent(parts[1] || "")}`); location.hash = `#/falcon/${r.falcon_id}`; }
    catch (e) { toast(e.message, true); location.hash = "#/falcons"; }
    return;
  }
  let unread = 0;
  try { unread = (await api("/notifications")).filter((n) => !n.read).length; } catch { /* ignore */ }
  const active = { falcon: "falcons", flight: "flights", dashboard: "overview", admin: "settings" }[name] || name;
  app.innerHTML = `<div class="shell"><aside class="side"><div class="brand"><b>FALCON INTELLIGENCE</b><span>Powered by HolyHornet</span></div>
    <nav class="nav">${NAV.filter((n) => !n[2] || can(n[2])).map(([k, label]) => `<a href="#/${k}" class="${k === active ? "on" : ""}">${label}${k === "overview" && unread ? `<span class="cnt">${unread}</span>` : ""}</a>`).join("")}</nav>
    ${window.FI_BACK ? `<div style="padding:10px 10px 0"><a class="small" href="${esc(window.FI_BACK)}">← HolyHornet projects</a></div>` : ""}<div class="who"><b>${esc(S.user.name)}</b><div class="muted">${esc(S.user.title || S.user.role)}</div><div class="row" style="margin-top:8px"><button class="sm" id="out">Sign out</button><button class="sm" id="thm" title="Switch theme">${document.documentElement.dataset.theme === "light" ? "Dark" : "Light"} theme</button></div></div></aside>
    <main class="main">${S.meta.demo ? `<div class="demo-bar">Demo workspace — every bird, record and telemetry point here is synthetic. Tracker data is simulated.${window.FI_ENGINE === "browser" ? " This edition runs entirely in your browser: nothing is sent to a server, and everything resets when you reload the page." : ""}</div>` : ""}<div id="main"><div class="muted">Loading…</div></div></main></div>`;
  $("#out").onclick = () => logout();
  $("#thm").onclick = () => { setTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light"); route(); };
  const view = ROUTES[name];
  const main = $("#main");
  if (!view) { main.innerHTML = `<div class="card">Page not found.</div>`; return; }
  try { await view(main, parts.slice(1)); } catch (e) { main.innerHTML = `<div class="card"><b>Could not load this page.</b><div class="muted">${esc(e.message)}</div></div>`; }
}

async function start() {
  if (window.FI_ENGINE === "browser") {
    const app = $("#app");
    app.innerHTML = `<div class="login"><div class="brand" style="text-align:center;padding-bottom:18px"><b style="font-size:22px">FALCON INTELLIGENCE</b><span>Powered by HolyHornet</span></div>
      <div class="card"><h2>Starting the platform in your browser</h2><div id="boot" class="muted">Starting…</div>
      <div class="small muted" style="margin-top:12px">This edition runs the whole platform inside this tab: nothing is installed and nothing is sent to a server. The first start downloads about 25 MB and takes up to a minute. All data is synthetic.</div></div></div>`;
    try { await startEngine((t) => { const b = $("#boot"); if (b) b.textContent = t; }); }
    catch (e) { $("#boot").innerHTML = `<b style="color:var(--bad)">Could not start.</b> ${esc(e.message)}<div class="small" style="margin-top:6px">Try reloading the page in a current version of Chrome, Edge, Firefox or Safari.</div>`; return; }
    localStorage.removeItem("fi_token"); S.token = null;      // a fresh in-tab database knows no earlier session
  }
  window.addEventListener("hashchange", route);
  route();
}
start();
