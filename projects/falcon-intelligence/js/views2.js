// Stage 2 pages: flight / training / feeding hubs, Recovery Center, shared recovery view, AI assistant,
// organisations, settings, weather card, pedigree chart.
import { S, $, $$, api, esc, can, toast, guard, dt, day, ago, dur, dist, kmh, num, every, prov, lvl, state, makeMap, drawZones, dotIcon,
  STATE_COLOR, formModal, infoModal, openAuthed, nowLocal, setTheme } from "./core.js";
import { route } from "./app.js";
import { adminView } from "./ops.js";

const reload = () => route();
const go = (root) => $$("[data-go]", root).forEach((r) => r.onclick = () => { location.hash = r.dataset.go; });

// --- weather card -----------------------------------------------------------------------------------
export function weatherCard(w) {
  if (!w || w.status !== "ok") return `<div class="card"><h2>Conditions</h2><div class="muted">${esc(w?.message || "No weather data.")}</div></div>`;
  const c = w.current, ex = w.exceeded;
  return `<div class="card"><div class="row"><h2 class="grow">Conditions — ${esc(w.zone?.name || "")}</h2>${prov("estimated")}</div>
    <div class="row" style="gap:18px;font-size:15px"><b>${num(c.temp_c, 0)} °C</b><span>wind ${num(c.wind_kph, 0)} km/h ${esc(c.wind_dir || "")}${c.gust_kph != null ? `, gusts ${num(c.gust_kph, 0)}` : ""}</span>
      <span>humidity ${num(c.humidity_pct, 0)}%</span><span>visibility ${c.visibility_km ?? "—"} km</span><span>${esc(c.sky)}</span></div>
    ${ex.length ? `<div class="note warn"><b>Outside your organisation's thresholds:</b> ${ex.map((e) => `${esc(e.label.toLowerCase())} ${e.limit} ${esc(e.unit)} (now ${e.value})`).join("; ")}.</div>`
    : Object.keys(w.thresholds).length ? `<div class="small" style="color:var(--ok);margin-top:6px">Within the thresholds your organisation configured — this is not a statement that flying is safe.</div>` : `<div class="small muted" style="margin-top:6px">No thresholds configured.</div>`}
    ${w.forecast_exceeded.length ? `<div class="small muted">Forecast outside thresholds at: ${w.forecast_exceeded.map((f) => esc(f.time.slice(11, 16)) + " UTC").join(", ")}</div>` : ""}
    <div class="small muted" style="margin-top:6px">${esc(w.provider)} · fetched ${dt(w.fetched)} · ${esc(w.disclaimer)}</div></div>`;
}

// --- pedigree chart ---------------------------------------------------------------------------------
export function pedigreeSvg(tree) {
  const W = 190, H = 46, GX = 46, GY = 12, nodes = [], links = [];
  let leaf = 0;
  const place = (n, depth) => {
    if (!n) return null;
    const kids = [place(n.sire, depth + 1), place(n.dam, depth + 1)].filter(Boolean);
    const y = kids.length ? kids.reduce((a, k) => a + k.y, 0) / kids.length : leaf++ * (H + GY);
    const me = { n, x: depth * (W + GX), y, depth };
    nodes.push(me);
    kids.forEach((k) => links.push([me, k]));
    return me;
  };
  place(tree, 0);
  const w = (Math.max(...nodes.map((n) => n.depth)) + 1) * (W + GX) - GX, h = Math.max(leaf, 1) * (H + GY) - GY;
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;max-width:${w}px;height:auto" role="img" aria-label="Family tree">
    ${links.map(([a, b]) => `<path d="M${a.x + W} ${a.y + H / 2} C${a.x + W + GX / 2} ${a.y + H / 2}, ${b.x - GX / 2} ${b.y + H / 2}, ${b.x} ${b.y + H / 2}" fill="none" stroke="var(--gold2)" stroke-width="1.5"/>`).join("")}
    ${nodes.map(({ n, x, y, depth }) => `<a href="#/falcon/${n.id}"><rect x="${x}" y="${y}" width="${W}" height="${H}" rx="8" fill="var(--panel2)" stroke="${depth ? "var(--line)" : "var(--gold)"}"/>
      <text x="${x + 10}" y="${y + 19}" fill="var(--text)" font-size="13" font-weight="600">${esc(n.name)}</text>
      <text x="${x + 10}" y="${y + 35}" fill="var(--muted)" font-size="10.5">${esc(n.sex === "male" ? "sire line · male" : n.sex === "female" ? "female" : "sex unknown")}${n.hatch_date ? " · " + esc(n.hatch_date.slice(0, 4)) : ""}</text></a>`).join("")}</svg>`;
}

// --- hubs -------------------------------------------------------------------------------------------
export async function flightsHub(main) {
  const d = await api("/flights/recent?days=14");
  main.innerHTML = `<div class="head"><div><h1>Flight Intelligence</h1><div class="muted">Recorded flights across your falcons — each bird measured against its own history</div></div></div>
    <div class="note">${esc(d.note)}</div>
    <div class="card"><h2>By falcon</h2><table><tr><th>Falcon</th><th>Tracked flights</th><th>Last flight</th><th>Individual baseline</th><th>Recent flights with a deviation ${prov("ai_interpretation")}</th></tr>
      ${d.per_falcon.map((p) => `<tr class="click" data-go="#/falcon/${p.falcon_id}/flights"><td><b>${esc(p.name)}</b></td><td>${p.flights}</td><td>${dt(p.last_flight)}</td>
        <td>${p.baseline_ready ? `<span class="badge" style="color:var(--ok)">ready</span>` : `<span class="badge">building</span>`}</td><td>${p.recent_flights_with_deviation} of last 5</td></tr>`).join("")}</table></div>
    <div class="card" style="margin-top:14px"><h2>Flights in the last 14 days (${d.flights.length})</h2><div class="scroll" style="max-height:560px"><table>
      <tr><th>Start</th><th>Falcon</th><th>Duration</th><th>Distance</th><th>Max height</th><th>Peak speed</th><th>Pattern</th><th>Data quality</th></tr>
      ${d.flights.map((x) => `<tr class="click" data-go="#/flight/${x.id}"><td class="nowrap">${dt(x.start)}${x.simulated ? ` <span class="badge">simulated</span>` : ""}${x.imported ? ` <span class="badge">imported</span>` : ""}</td><td>${esc(x.name)}</td><td>${dur(x.duration_s)}</td><td>${dist(x.distance_m)}</td>
        <td>${x.max_height_m != null ? num(x.max_height_m, 0) + " m" : "—"}</td><td>${kmh(x.max_speed_mps)}</td><td class="small">${esc(x.pattern)}</td><td>${((x.data_quality || 0) * 100).toFixed(0)}%</td></tr>`).join("")}</table></div></div>`;
  go(main);
}

export async function trainingHub(main) {
  const [d, w] = await Promise.all([api("/training/recent?days=14"), api("/weather").catch(() => null)]);
  main.innerHTML = `<div class="head"><div><h1>Training Management</h1><div class="muted">Sessions logged in the last 14 days</div></div></div>
    <div class="grid g2">${weatherCard(w)}<div class="card"><h2>By falcon ${prov("derived")}</h2><table><tr><th>Falcon</th><th>Sessions</th><th>Completed</th><th>Minutes</th><th>Last session</th></tr>
      ${d.per_falcon.map((p) => `<tr class="click" data-go="#/falcon/${p.falcon_id}/training"><td><b>${esc(p.name)}</b></td><td>${p.sessions}</td><td>${p.completed}</td><td>${p.minutes}</td><td>${dt(p.last)}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">No sessions.</td></tr>`}</table>
      <div class="small muted" style="margin-top:6px">Open a falcon to log a session, compare two periods or export a report.</div></div></div>
    <div class="card" style="margin-top:14px"><h2>Sessions</h2><div class="scroll" style="max-height:560px"><table><tr><th>Date</th><th>Falcon</th><th>Type</th><th>Trainer</th><th>Duration</th><th>Conditions</th><th>Outcome</th><th>Observations</th></tr>
      ${d.sessions.map((s) => { const c = s.conditions || {}; return `<tr class="click" data-go="#/falcon/${s.falcon_id}/training"><td class="nowrap">${dt(s.start)}</td><td>${esc(s.name)}</td><td>${esc(s.type)}</td><td>${esc(s.trainer_name || "")}</td><td>${s.duration_min != null ? s.duration_min + " min" : "—"}</td>
        <td class="small">${c.temp_c != null ? c.temp_c + " °C" : ""}${c.wind_kph != null ? ` · wind ${c.wind_kph} km/h` : ""}${c.sky ? ` · ${esc(c.sky)}` : ""}</td><td><span class="badge">${esc(s.outcome || "—")}</span></td><td class="small">${esc(s.observations || "")}</td></tr>`; }).join("")}</table></div></div>`;
  go(main);
}

const spark = (v) => { if (v.length < 2) return ""; const lo = Math.min(...v), hi = Math.max(...v), r = hi - lo || 1;
  return `<svg viewBox="0 0 100 24" style="width:110px;height:24px"><polyline fill="none" stroke="var(--gold)" stroke-width="1.5" points="${v.map((y, i) => `${(i / (v.length - 1) * 100).toFixed(1)},${(22 - (y - lo) / r * 20).toFixed(1)}`).join(" ")}"/></svg>`; };

export async function feedingHub(main) {
  const d = await api("/feeding/summary");
  main.innerHTML = `<div class="head"><div><h1>Feeding &amp; Weight</h1><div class="muted">Latest recorded weights against veterinary target ranges</div></div></div>
    <div class="note">Records and analytics to support professional decisions. Feeding plans and target ranges are written by people; the platform never changes them.</div>
    <div class="card"><table><tr><th>Falcon</th><th>Latest weight ${prov("user_observation")}</th><th>14-day trend</th><th>14-day median ${prov("derived")}</th><th>Vet target range ${prov("vet_assessment")}</th><th>Against target</th><th>Last feeding</th></tr>
      ${d.map((x) => `<tr class="click" data-go="#/falcon/${x.falcon_id}/feeding"><td><b>${esc(x.name)}</b></td><td>${x.latest_g != null ? `${x.latest_g.toFixed(0)} g<div class="small muted">${dt(x.latest_ts)}</div>` : `<span class="muted">none in 14 days</span>`}</td>
        <td>${spark(x.spark)}</td><td>${x.median_14d_g ?? "—"}${x.median_14d_g ? " g" : ""}</td><td>${x.target ? `${x.target[0].toFixed(0)}–${x.target[1].toFixed(0)} g` : `<span class="muted">not set</span>`}</td>
        <td>${x.against_target ? `<span class="badge" style="color:${x.against_target === "within range" ? "var(--ok)" : "var(--warn)"}">${esc(x.against_target)}</span>` : "—"}</td>
        <td class="small">${x.last_feeding ? `${esc(x.last_feeding.food_type)}${x.last_feeding.quantity_g ? ` · ${x.last_feeding.quantity_g} g` : ""}<div class="muted">${dt(x.last_feeding.ts)}</div>` : "—"}</td></tr>`).join("")}</table></div>`;
  go(main);
}

// --- recovery center ----------------------------------------------------------------------------------
export async function recoveryView(main, [id]) {
  if (id) return recoveryCase(main, id);
  const cases = await api("/recovery");
  const W = can("recovery.write") && S.user.role !== "recovery";
  main.innerHTML = `<div class="head"><div><h1>Recovery Center</h1><div class="muted">Lost-falcon cases, sightings and controlled location sharing</div></div>${W ? `<button class="primary" id="open">Report a missing falcon</button>` : ""}</div>
    <div class="note">A falcon's location is never public. Cases are visible to authorised members and named recovery contacts; outside helpers get an expiring link that the owner can revoke. Every access to location data is logged.</div>
    <div class="card">${cases.length ? `<table><tr><th>Falcon</th><th>Status</th><th>Opened</th><th>Tracker status when opened</th><th>Contacts</th><th>Sightings</th><th>Outcome</th></tr>
      ${cases.map((c) => `<tr class="click" data-go="#/recovery/${c.id}"><td><b>${esc(c.falcon.name)}</b><div class="small muted">${esc(c.falcon.code)}</div></td>
        <td><span class="state ${c.status === "open" ? "stale" : "unavailable"}">${esc(c.status)}</span></td><td>${dt(c.opened_at)}<div class="small muted">${esc(c.opened_by_name || "")}</div></td>
        <td>${esc(c.snapshot?.label || "—")}</td><td class="small">${c.contact_names.map((n) => esc(n.name)).join(", ") || "—"}</td><td>${c.sightings_count}</td><td>${esc(c.outcome || "—")}</td></tr>`).join("")}</table>`
    : `<div class="muted">No recovery cases.</div>`}</div>`;
  go(main);
  if ($("#open")) $("#open").onclick = guard(openCaseForm);
}

export async function openCaseForm(falconId) {
  const [fs, contacts] = await Promise.all([api("/falcons"), api("/recovery/contacts")]);
  formModal("Report a missing falcon", [
    { name: "falcon_id", label: "Falcon", type: "select", value: typeof falconId === "number" ? falconId : "", options: fs.map((f) => [f.id, `${f.name} (${f.code})`]) },
    { name: "circumstances", label: "What happened", type: "textarea", required: true },
    { name: "last_confirmed_ts", label: "Last time someone saw the bird", type: "datetime-local", value: nowLocal() },
    { name: "last_confirmed_note", label: "Where and how it was last seen", type: "textarea" },
    ...contacts.filter((c) => c.id !== S.user.id).map((c) => ({ name: "c_" + c.id, label: `Notify ${c.name} (${c.role})`, type: "checkbox", value: c.role === "recovery" })),
  ], async (v) => { const ids = Object.keys(v).filter((k) => k.startsWith("c_") && v[k]).map((k) => +k.slice(2));
    const c = await api(`/falcons/${v.falcon_id}/recovery`, { body: { circumstances: v.circumstances, last_confirmed_ts: v.last_confirmed_ts, last_confirmed_note: v.last_confirmed_note, contacts: ids } });
    toast("Recovery case opened — contacts notified"); location.hash = `#/recovery/${c.id}`; },
  { intro: `<div class="note">Opening a case records the tracker's last valid position and notifies the contacts you select. A missing tracker signal on its own does not mean the bird is lost — check the tracker and the bird's known location first.</div>`, submit: "Open recovery case" });
}

function caseMap(el, c, pos, track, sightings, zones, onClick) {
  const map = makeMap(el);
  if (zones) drawZones(map, zones);
  const pts = [];
  if (track.length) { const line = track.map((p) => [p.lat, p.lon]); L.polyline(line, { color: "#d2a24c", weight: 2.5, opacity: .8 }).bindTooltip("Recorded path before the last valid fix").addTo(map); pts.push(...line); }
  if (pos?.position) { const p = [pos.position.lat, pos.position.lon]; pts.push(p);
    L.marker(p, { icon: dotIcon(STATE_COLOR[pos.state] || "#e06a52", pos.state === "live") }).bindTooltip(`Last valid tracker fix · ${ago(pos.age_s)}`, { permanent: true, direction: "top", offset: [0, -8] }).addTo(map);
    if (pos.position.accuracy_m) L.circle(p, { radius: pos.position.accuracy_m, color: "#6aa5d8", weight: 1, fillOpacity: .1 }).addTo(map); }
  const lc = c.last_confirmed || (c.last_confirmed_lat != null ? [c.last_confirmed_lat, c.last_confirmed_lon] : null);
  if (lc && lc[0] != null) { pts.push(lc); L.circleMarker(lc, { radius: 7, color: "#5fb37a", weight: 2 }).bindTooltip("Last confirmed observation by a person").addTo(map); }
  sightings.filter((s) => s.lat != null).forEach((s) => { pts.push([s.lat, s.lon]);
    L.circleMarker([s.lat, s.lon], { radius: 7, color: s.certainty === "confirmed" ? "#5fb37a" : "#b08be0", weight: 2, fillOpacity: .5 }).bindTooltip(`${s.certainty} sighting — ${esc(s.description)}`).addTo(map); });
  if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.3), { maxZoom: 15 });
  if (onClick) { let pick; map.on("click", (e) => { pick?.remove(); pick = L.marker(e.latlng).bindTooltip("Sighting position", { permanent: true }).addTo(map); onClick(e.latlng); }); }
  return map;
}

const sightingRows = (ss) => ss.map((s) => `<div style="padding:7px 0;border-bottom:1px solid var(--line)"><div class="row"><span class="badge" style="color:${s.certainty === "confirmed" ? "var(--ok)" : "var(--p-ai)"}">${esc(s.certainty)}</span><span class="grow">${esc(s.description)}</span></div>
  <div class="small muted">${dt(s.ts)} · ${esc(s.reporter_name || "")}${s.lat != null ? ` · ${(+s.lat).toFixed(4)}, ${(+s.lon).toFixed(4)}` : " · no position given"}</div></div>`).join("") || `<div class="muted">No sightings recorded.</div>`;

async function recoveryCase(main, id) {
  const c = await api(`/recovery/${id}`);
  const p = c.current, pos = p.position, snap = c.snapshot || {}, open = c.status === "open";
  const W = can("recovery.write"), own = W && S.user.role !== "recovery";
  let picked = null;
  main.innerHTML = `<div class="head"><div><div class="small"><a href="#/recovery">Recovery Center</a> /</div><h1>${esc(c.falcon.name)} — recovery case</h1>
      <div class="muted">Opened ${dt(c.opened_at)} by ${esc(c.opened_by_name || "")} · <span class="state ${open ? "stale" : "unavailable"}">${esc(c.status)}${c.outcome ? " — " + esc(c.outcome) : ""}</span></div></div>
      <div class="row">${own && open ? `<button id="close" class="primary">Close case</button>` : ""}</div></div>
    <div class="grid g21"><div><div id="map" class="map tall"></div><div class="small muted" style="margin-top:6px">
      <span class="dot" style="background:#e06a52"></span>last valid tracker fix <span class="dot" style="background:#d2a24c;margin-left:8px"></span>recorded path <span class="dot" style="background:#5fb37a;margin-left:8px"></span>confirmed by a person <span class="dot" style="background:#b08be0;margin-left:8px"></span>possible sighting${W && open ? " · click the map to place a sighting" : ""}</div></div>
    <div><div class="card"><div class="row"><h2 class="grow">Last valid telemetry position</h2>${state(p.state, p.label)}</div>
        <div class="note ${p.state === "stale" ? "warn" : ""}">${esc(p.explain)}</div>
        ${pos ? `<dl class="kv"><dt>Position</dt><dd>${pos.lat.toFixed(5)}, ${pos.lon.toFixed(5)} ${prov("measured")}</dd><dt>Timestamp</dt><dd>${dt(pos.ts)} <span class="muted">(${ago(p.age_s)})</span></dd>
          <dt>Tracking accuracy</dt><dd>${pos.accuracy_m != null ? `±${pos.accuracy_m} m ${prov("estimated")}` : "not reported"}</dd>
          <dt>Battery</dt><dd>${p.device?.battery_pct != null ? num(p.device.battery_pct, 0) + "% at last report " + prov("measured") : "—"}</dd>
          <dt>Device status</dt><dd>${p.device ? `${esc(p.device.serial)} · last report ${p.device.last_seen ? dt(p.device.last_seen) : "never"}${p.device.link ? " via " + esc(p.device.link) : ""}` : "no tracker"}</dd></dl>` : ""}
        ${snap.position && pos && snap.position.ts !== pos.ts ? `<div class="small" style="color:var(--ok);margin-top:6px">The tracker has reported a newer position since the case was opened (${dt(snap.position.ts)} → ${dt(pos.ts)}).</div>` : ""}
        ${p.simulated ? `<div class="small muted">Tracker data for this bird is simulated.</div>` : ""}</div>
      <div class="card" style="margin-top:14px"><h2>Recovery assistance</h2>${c.assist.facts.map((f) => `<div style="margin:4px 0">${esc(f.text)} ${prov(f.provenance)}</div>`).join("")}<div class="note">${esc(c.assist.note)}</div></div>
      <div class="card" style="margin-top:14px"><h2>Last confirmed observation ${prov("user_observation")}</h2>
        <div>${c.last_confirmed_ts ? dt(c.last_confirmed_ts) : `<span class="muted">time not recorded</span>`}</div><div class="small">${esc(c.last_confirmed_note || "")}</div>
        <h3>Circumstances</h3><div class="small">${esc(c.circumstances || "—")}</div>
        <h3>Notified contacts</h3><div class="small">${c.contact_names.map((n) => esc(n.name)).join(", ") || "none"}</div></div></div></div>
    <div class="grid g2" style="margin-top:14px"><div class="card"><div class="row"><h2 class="grow">Sightings</h2>${W && open ? `<button class="sm" id="adds">Add sighting</button>` : ""}</div><div class="scroll">${sightingRows(c.sightings)}</div></div>
      <div class="card"><div class="row"><h2 class="grow">Recovery actions</h2>${W && open ? `<button class="sm" id="adda">Record action</button>` : ""}</div>
        <div class="scroll">${c.actions.map((a) => `<div style="padding:6px 0;border-bottom:1px solid var(--line)">${esc(a.text)}<div class="small muted">${dt(a.ts)} · ${esc(a.user_name)}</div></div>`).join("")}</div></div></div>
    ${can("location.share") ? `<div class="grid g2" style="margin-top:14px"><div class="card"><div class="row"><h2 class="grow">Location sharing</h2>${open ? `<button class="sm" id="share">Create expiring link</button>` : ""}</div>
        ${c.links.length ? `<table><tr><th>Given to</th><th>Expires</th><th>State</th><th>Opened</th><th></th></tr>${c.links.map((l) => `<tr><td>${esc(l.label)}</td><td class="small">${dt(l.expires)}</td>
          <td><span class="badge" style="color:${l.state === "active" ? "var(--ok)" : "var(--muted)"}">${l.state}</span></td><td>${l.access_count}×${l.last_access ? `<div class="small muted">${dt(l.last_access)}</div>` : ""}</td>
          <td>${l.state === "active" ? `<button class="sm" data-revoke="${l.id}">Revoke</button>` : ""}</td></tr>`).join("")}</table>` : `<div class="muted">Nothing shared outside the organisation.</div>`}
        <div class="small muted" style="margin-top:6px">Links show the falcon's name, last position, path and sightings only — never ownership or identification details. Closing the case revokes every link.</div></div>
      <div class="card"><h2>Location access log</h2><div class="scroll" style="max-height:260px"><table><tr><th>When</th><th>Who</th><th>What</th></tr>${c.access_log.map((a) => `<tr><td class="small nowrap">${dt(a.ts)}</td><td>${esc(a.actor_name || a.actor)}${a.actor.startsWith("link:") ? ` <span class="badge">shared link</span>` : ""}</td><td class="small">${esc(a.what.replace(/_/g, " "))}</td></tr>`).join("")}</table></div></div></div>` : ""}`;
  caseMap($("#map"), c, p, c.track, c.sightings, S.meta.zones, W && open ? (ll) => { picked = ll; toast("Position set — now choose “Add sighting”"); } : null);
  if ($("#adds")) $("#adds").onclick = () => formModal("Add sighting", [{ name: "description", label: "What was seen", type: "textarea", required: true },
    { name: "certainty", label: "Certainty", type: "select", options: [["possible", "Possible — not confirmed"], ["confirmed", "Confirmed — bird identified"]] },
    { name: "ts", label: "When", type: "datetime-local", value: nowLocal() }, { name: "reporter_name", label: "Reported by", value: S.user.name },
    { name: "lat", label: "Latitude (or click the map first)", type: "number", value: picked?.lat.toFixed(5) }, { name: "lon", label: "Longitude", type: "number", value: picked?.lng.toFixed(5) }],
  async (v) => { await api(`/recovery/${id}/sightings`, { body: v }); reload(); });
  if ($("#adda")) $("#adda").onclick = () => formModal("Record recovery action", [{ name: "text", label: "Action taken", type: "textarea", required: true }], async (v) => { await api(`/recovery/${id}/actions`, { body: v }); reload(); });
  if ($("#close")) $("#close").onclick = () => formModal("Close recovery case", [{ name: "outcome", label: "Outcome", type: "select", options: ["recovered", "not recovered", "false alarm"] }, { name: "note", label: "Closing note", type: "textarea" }],
    async (v) => { await api(`/recovery/${id}/close`, { body: v }); toast("Case closed — all share links revoked"); reload(); });
  if ($("#share")) $("#share").onclick = () => formModal("Share location for this recovery", [{ name: "label", label: "Who is this link for", required: true, placeholder: "Name of the person or team" },
    { name: "hours", label: "Valid for", type: "select", value: 24, options: [[1, "1 hour"], [6, "6 hours"], [24, "24 hours"], [72, "3 days"], [168, "7 days"]] }],
  async (v) => { const r = await api(`/recovery/${id}/links`, { body: v });
    setTimeout(() => { const m = infoModal("Share link created", `<p>Send this link only to <b>${esc(v.label)}</b>. It is shown once.</p><pre style="white-space:pre-wrap;word-break:break-all">${esc(r.url)}</pre><p class="small muted">${esc(r.note)} Expires ${dt(r.expires)}.</p>${window.FI_ENGINE === "browser" ? `<p class="small" style="color:var(--warn)">Browser edition: each tab has its own private database, so this link only opens in this tab. <a href="${esc(r.url.slice(r.url.indexOf("#")))}">Open the shared view here</a>.</p>` : ""}<button id="cp">Copy link</button>`);
      $("#cp", m).onclick = () => navigator.clipboard?.writeText(r.url).then(() => toast("Copied")); $("[data-x]", m).addEventListener("click", reload); }, 0); },
  { intro: `<div class="note warn">Anyone holding the link can see this falcon's last known position until it expires or you revoke it. Each use is logged.</div>`, submit: "Create link" });
  $$("[data-revoke]", main).forEach((b) => b.onclick = guard(async () => { await api(`/share-links/${b.dataset.revoke}/revoke`, { body: {} }); toast("Link revoked"); reload(); }));
  if (open) every(15000, async () => { const n = await api(`/recovery/${id}`); if (n.current.position?.ts !== pos?.ts || n.sightings.length !== c.sightings.length) reload(); });
}

// public page opened from a share link (no sign-in)
export async function shareView(app, token) {
  app.innerHTML = `<div class="main" style="max-width:1100px;margin:0 auto"><div class="brand"><b>FALCON INTELLIGENCE</b><span>Recovery assistance — shared view</span></div><div id="sv" class="muted">Loading…</div></div>`;
  let d;
  try { d = await api(`/share/${encodeURIComponent(token)}`); } catch (e) { $("#sv").innerHTML = `<div class="card"><b>This link cannot be opened.</b><div class="muted">${esc(e.message)}</div></div>`; return; }
  const p = d.position, pos = p.position;
  let picked = null;
  $("#sv").className = "";
  $("#sv").innerHTML = `<div class="note warn">${esc(d.notice)} Link for <b>${esc(d.link.label)}</b>, valid until ${dt(d.link.expires)}.</div>
    <h1>Help find ${esc(d.falcon.name)}</h1><div class="muted">${esc(d.falcon.species || "Falcon")} · ${esc(d.falcon.sex)} · reported missing ${dt(d.case.opened_at)}</div>
    <div class="grid g21" style="margin-top:14px"><div><div id="map" class="map tall"></div><div class="small muted" style="margin-top:6px">Click the map to mark where you saw the bird, then describe it.</div></div>
    <div><div class="card"><div class="row"><h2 class="grow">Last known tracker position</h2>${state(p.state, p.label)}</div><div class="note">${esc(p.explain)}</div>
        ${pos ? `<dl class="kv"><dt>Position</dt><dd>${pos.lat.toFixed(5)}, ${pos.lon.toFixed(5)}</dd><dt>Time</dt><dd>${dt(pos.ts)} (${ago(p.age_s)})</dd><dt>Accuracy</dt><dd>${pos.accuracy_m != null ? "about ±" + pos.accuracy_m + " m (estimate)" : "not reported"}</dd>
          <dt>Tracker battery</dt><dd>${d.battery_pct != null ? num(d.battery_pct, 0) + "% at last report" : "—"}</dd></dl>` : ""}
        <div class="small muted">The bird may have moved a long way since this fix.</div></div>
      <div class="card" style="margin-top:14px"><h2>What happened</h2><div class="small">${esc(d.case.circumstances || "—")}</div>${d.case.last_confirmed_note ? `<h3>Last seen by a person</h3><div class="small">${esc(d.case.last_confirmed_note)}${d.case.last_confirmed_ts ? " — " + dt(d.case.last_confirmed_ts) : ""}</div>` : ""}</div>
      <div class="card" style="margin-top:14px"><h2>Report a sighting</h2><label>What did you see?</label><textarea id="sd" rows="3"></textarea><label>Your name</label><input id="sn" value="${esc(d.link.label)}">
        <div class="small muted" id="sp" style="margin-top:6px">No position selected.</div><div style="margin-top:10px"><button class="primary" id="ss">Send sighting</button></div>
        <div class="small muted" style="margin-top:8px">Do not try to catch or handle the falcon unless the owner asks you to.</div></div>
      <div class="card" style="margin-top:14px"><h2>Sightings so far</h2>${sightingRows(d.sightings)}</div></div></div>`;
  caseMap($("#map"), d.case, p, d.track, d.sightings, null, (ll) => { picked = ll; $("#sp").textContent = `Position selected: ${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`; });
  $("#ss").onclick = guard(async () => { if (!$("#sd").value.trim()) throw new Error("Describe what you saw");
    await api(`/share/${encodeURIComponent(token)}/sightings`, { body: { description: $("#sd").value, reporter_name: $("#sn").value, lat: picked?.lat, lon: picked?.lng } });
    toast("Sighting sent to the owner's team"); shareView(app, token); });
}

// --- AI assistant -------------------------------------------------------------------------------------
export async function assistantView(main) {
  const ex = await api("/assistant/examples");
  main.innerHTML = `<div class="head"><div><h1>AI Assistant</h1><div class="muted">Answers come only from records you are authorised to see, with a reference to each record used</div></div></div>
    <div class="note">Engine: ${esc(ex.engine)}. It looks things up; it does not generate facts. If it cannot find something or you lack access, it says so.</div>
    <div class="card"><form id="af" class="row"><input id="aq" class="grow" placeholder="Ask about a falcon's location, flights, weight, veterinary records, devices or recovery cases" autocomplete="off"><button class="primary">Ask</button></form>
      <div class="row" style="margin-top:10px">${ex.examples.map((e) => `<button type="button" class="sm" data-ex="${esc(e)}">${esc(e)}</button>`).join("")}</div></div><div id="log"></div>`;
  const ask = guard(async (q) => {
    const a = await api("/assistant", { body: { question: q } });
    const el = document.createElement("div");
    el.className = "card"; el.style.marginTop = "12px";
    el.innerHTML = `<div class="small muted">You asked</div><div style="margin-bottom:8px"><b>${esc(q)}</b></div><div>${esc(a.answer)}</div>
      ${a.table ? `<div class="scroll" style="margin-top:8px"><table><tr>${a.table.head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>${a.table.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</table></div>` : ""}
      ${a.examples ? `<div class="small muted" style="margin-top:6px">Examples: ${a.examples.map(esc).join(" · ")}</div>` : ""}
      ${a.references?.length ? `<h3>Records used</h3>${a.references.map((r) => r.link.startsWith("report:") ? `<a href="#" data-report="${esc(r.link.slice(7))}" class="badge" style="margin:0 6px 4px 0">${esc(r.label)}</a>` : `<a href="${esc(r.link)}" class="badge" style="margin:0 6px 4px 0">${esc(r.label)}</a>`).join("")}` : ""}
      <div class="small muted" style="margin-top:6px">${a.tool ? `Lookup: ${esc(a.tool.replace(/_/g, " "))}` : "No lookup matched"}${a.denied ? " · access denied for your role" : ""}</div>`;
    $$("[data-report]", el).forEach((x) => x.onclick = guard(async (e) => { e.preventDefault(); await openAuthed(x.dataset.report); }));
    $("#log").prepend(el);
  });
  $("#af").onsubmit = (e) => { e.preventDefault(); const q = $("#aq").value.trim(); if (q) { ask(q); $("#aq").value = ""; } };
  $$("[data-ex]", main).forEach((b) => b.onclick = () => ask(b.dataset.ex));
}

// --- organisations ------------------------------------------------------------------------------------
export async function orgView(main) {
  const o = await api("/organization");
  main.innerHTML = `<div class="head"><div><h1>Organizations</h1><div class="muted">${esc(o.org.name)} · ${esc(o.org.kind)} · ${esc(o.org.country)}</div></div></div>
    <div class="grid g2"><div class="card"><h2>Members</h2><table><tr><th>Name</th><th>Role</th><th>Title</th></tr>${o.members.map((m) => `<tr><td>${esc(m.name)}</td><td><span class="badge">${esc(m.role.replace("_", " "))}</span></td><td class="small">${esc(m.title || "")}</td></tr>`).join("")}</table></div>
      <div class="card"><div class="row"><h2 class="grow">Falcons shared with other professionals</h2>${o.can_manage ? `<button class="sm" id="grant">Share a falcon</button>` : ""}</div>
        ${o.can_manage ? (o.grants.length ? `<table><tr><th>Falcon</th><th>Shared with</th><th>Purpose</th><th>Until</th><th>State</th><th></th></tr>${o.grants.map((g) => `<tr><td>${esc(g.falcon_name)}</td><td>${esc(g.user_name)}<div class="small muted">${esc(g.user_role)} · ${esc(g.user_org)}</div></td>
          <td class="small">${esc(g.purpose || "")}</td><td class="small">${g.expires ? day(g.expires) : "no end date"}</td><td><span class="badge" style="color:${g.state === "active" ? "var(--ok)" : "var(--muted)"}">${g.state}</span></td>
          <td>${g.state === "active" ? `<button class="sm" data-rev="${g.id}">Revoke</button>` : ""}</td></tr>`).join("")}</table>` : `<div class="muted">No falcon is shared outside this organisation.</div>`) : `<div class="muted">Only owners and managers can see and change sharing.</div>`}
        <div class="small muted" style="margin-top:6px">The falcon stays under its owner's control: a grant lets one named professional work on one bird within their own role, and can be revoked at any time. Location still requires a role with telemetry access.</div>
        ${o.shared_with_me.length ? `<h3>Shared with you</h3>${o.shared_with_me.map((f) => `<div><a href="#/falcon/${f.id}">${esc(f.name)}</a> <span class="small muted">from ${esc(f.owner_org)}</span></div>`).join("")}` : ""}</div></div>
    <div class="card" style="margin-top:14px"><h2>Roles and permissions</h2><div class="scroll" style="max-height:340px"><table><tr><th>Role</th><th>Permissions</th></tr>${Object.entries(o.roles).map(([r, ps]) => `<tr><td><b>${esc(r.replace("_", " "))}</b></td><td class="small">${ps.map((p) => `<span class="badge" style="margin:0 4px 3px 0">${esc(p)}</span>`).join("")}</td></tr>`).join("")}</table></div></div>
    <div class="card" style="margin-top:14px"><h2>Subscription packages</h2><div class="small muted">Configurable catalogue. No prices or payment provider are set — billing is a future module. Current package: <b>${esc(o.org.plan || "not set")}</b>.</div>
      <div class="grid g3" style="margin-top:10px">${o.plans.map((p) => `<div class="card" style="background:var(--panel2)${p.key === o.org.plan ? ";border-color:var(--gold)" : ""}"><b>${esc(p.name)}</b><div class="small muted">${esc(p.audience)}</div><ul style="margin:6px 0;padding-left:18px" class="small">${p.features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></div>`).join("")}</div></div>`;
  $$("[data-rev]", main).forEach((b) => b.onclick = guard(async () => { await api(`/access/${b.dataset.rev}/revoke`, { body: {} }); toast("Access revoked"); reload(); }));
  if ($("#grant")) $("#grant").onclick = guard(async () => { const fs = (await api("/falcons")).filter((f) => !f.shared_with_me);
    formModal("Share a falcon's record", [{ name: "falcon_id", label: "Falcon", type: "select", options: fs.map((f) => [f.id, f.name]) }, { name: "email", label: "Professional's platform email", type: "email", required: true },
      { name: "purpose", label: "Purpose", placeholder: "e.g. treatment at the hospital" }, { name: "days", label: "Valid for (days, blank = until revoked)", type: "number" }],
    async (v) => { await api(`/falcons/${v.falcon_id}/access`, { body: v }); toast("Access granted"); reload(); },
    { intro: `<div class="note">The person must already have an account in their own organisation. They will see this one falcon, limited by their own role.</div>` }); });
}

// --- settings -----------------------------------------------------------------------------------------
export async function settingsView(main) {
  const [s, svc, sim] = await Promise.all([api("/settings"), api("/ai/services"), api("/simulator")]);
  const th = s.weather.thresholds;
  main.innerHTML = `<div class="head"><div><h1>Settings</h1><div class="muted">Appearance, environment thresholds, AI services and simulator</div></div></div>
    <div class="grid g2"><div class="card"><h2>Appearance</h2><div class="row"><button data-theme-set="dark">Dark</button><button data-theme-set="light">Light</button><span class="small muted">Saved on this device.</span></div></div>
      <div class="card"><div class="row"><h2 class="grow">Weather &amp; environmental thresholds</h2>${s.can_write ? `<button class="sm" id="wset">Edit</button>` : ""}</div>
        <dl class="kv"><dt>Provider</dt><dd>${esc(s.weather.provider)}</dd>${Object.entries(s.threshold_fields).map(([k, l]) => `<dt>${esc(l)}</dt><dd>${th[k] ?? `<span class="muted">not set</span>`}</dd>`).join("")}
          <dt>Set by</dt><dd>${esc(s.weather.thresholds_set_by || "—")}${s.weather.thresholds_note ? ` — ${esc(s.weather.thresholds_note)}` : ""}</dd></dl>
        <div class="small muted" style="margin-top:6px">Thresholds are your organisation's own, set with professional guidance. They flag conditions; they never declare a flight safe. ${esc(s.privacy)}</div></div></div>
    <div class="card" style="margin-top:14px"><h2>AI services</h2><div class="small muted">Each service is a separate module behind a fixed interface, so it can be replaced without touching the others.</div>
      <table><tr><th>Service</th><th>Status</th><th>Validation</th><th>Implementation</th><th>Notes</th></tr>${svc.map((x) => `<tr><td><b>${esc(x.name)}</b></td><td><span class="badge" style="color:${x.status === "running" ? "var(--ok)" : "var(--warn)"}">${esc(x.status)}</span></td>
        <td class="small">${esc(x.validated)}</td><td class="small"><code>${esc(x.module)}</code></td><td class="small">${esc(x.note)}</td></tr>`).join("")}</table></div>
    <div class="card" style="margin-top:14px"><h2>Simulator</h2><div class="note">${esc(sim.note)}</div>
      ${sim.enabled && can("device.write") ? `<div class="row"><select id="sc" style="width:auto">${sim.live.map((x) => `<option value="${x.key}">${esc(x.label)}</option>`).join("")}</select><select id="sf" style="width:auto"></select><button class="primary" id="srun">Run scenario</button></div>` : `<div class="muted">The simulator is available in demo mode to roles that manage devices.</div>`}
      <h3>Scenarios shown with seeded data</h3>${sim.static.map((x) => `<div><a href="${esc(x.link)}">${esc(x.label)}</a> <span class="small muted">— ${esc(x.how)}</span></div>`).join("")}
      <h3>Recent runs</h3>${sim.runs.length ? `<table><tr><th>Started</th><th>Scenario</th><th>Falcon</th><th></th></tr>${sim.runs.map((r) => `<tr><td class="small">${dt(r.started)}</td><td>${esc(r.scenario.replace(/_/g, " "))}</td><td><a href="#/falcon/${r.falcon_id}/tracking">${esc(r.falcon || "")}</a></td><td><button class="sm" data-val="${r.id}">Reported vs ground truth</button></td></tr>`).join("")}</table>` : `<div class="muted">No runs yet.</div>`}</div>
    <div id="adm" style="margin-top:22px"></div>`;
  $$("[data-theme-set]", main).forEach((b) => b.onclick = () => { setTheme(b.dataset.themeSet); reload(); });
  if ($("#wset")) $("#wset").onclick = () => formModal("Weather provider and thresholds", [{ name: "provider", label: "Weather provider", type: "select", value: s.weather.provider, options: s.weather_providers },
    ...Object.entries(s.threshold_fields).map(([k, l]) => ({ name: k, label: `${l} (${k.includes("temp") ? "°C" : k.includes("vis") ? "km" : k.includes("hum") ? "%" : "km/h"})`, type: "number", value: th[k] })),
    { name: "note", label: "Basis for these values (who advised them)", value: s.weather.thresholds_note }],
  async (v) => { const { provider, note, ...thresholds } = v; await api("/settings/weather", { body: { provider, thresholds, note } }); toast("Saved"); reload(); },
  { intro: `<div class="note">Set thresholds with advice from your falconers and veterinary professionals. The platform only compares conditions with the values you enter.</div>` });
  if ($("#sf")) { const fs = (await api("/falcons")).filter((f) => f.position_state !== "no_device" && f.position_state !== "restricted");
    $("#sf").innerHTML = fs.map((f) => `<option value="${f.id}">${esc(f.name)}</option>`).join("");
    $("#srun").onclick = guard(async () => { const fid = $("#sf").value; const r = await api("/simulator/run", { body: { scenario: $("#sc").value, falcon_id: +fid } }); toast(`${r.label} — simulated flight started`); location.hash = `#/falcon/${fid}/tracking`; }); }
  $$("[data-val]", main).forEach((b) => b.onclick = guard(async () => { const v = await api(`/simulator/runs/${b.dataset.val}`);
    infoModal("Simulated reports against simulated ground truth", v.status !== "ok" ? `<div class="muted">No ground truth stored for this run yet.</div>` : `<dl class="kv"><dt>Scenario</dt><dd>${esc(v.scenario.replace(/_/g, " "))}</dd><dt>Truth points</dt><dd>${v.truth_points}</dd>
      <dt>Reports received</dt><dd>${v.reported_points} (${(v.delivery_ratio * 100).toFixed(0)}%)</dd><dt>Horizontal error</dt><dd>${v.horizontal_error_m ? `median ${v.horizontal_error_m.median} m · 95th percentile ${v.horizontal_error_m.p95} m` : "—"}</dd>
      <dt>Vertical error</dt><dd>${v.vertical_error_m ? `median ${v.vertical_error_m.median} m` : "—"}</dd><dt>Fixes flagged low quality</dt><dd>${v.low_quality_fixes.count}${v.low_quality_fixes.median_error_m != null ? ` (median error ${v.low_quality_fixes.median_error_m} m)` : ""}</dd></dl><div class="note">${esc(v.note)}</div>`); }));
  if (can("admin")) await adminView($("#adm"));
}
