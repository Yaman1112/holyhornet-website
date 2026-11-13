// Falcon record: identity, tracking, flights & performance, health, feeding & weight, training, media & vision.
import { S, $, $$, api, esc, can, toast, guard, dt, day, tm, ago, dur, dist, kmh, num, every, prov, provLegend, lvl, state, chart, makeMap,
  drawZones, dotIcon, STATE_COLOR, hydrateImages, blobUrl, formModal, infoModal, openAuthed, nowLocal, metricValue } from "./core.js";
import { alertCard, route } from "./app.js";
import { pedigreeSvg, openCaseForm } from "./views2.js";

const TABS = [["overview", "Identity"], ["tracking", "Tracking", "telemetry.read"], ["flights", "Flights & performance", "telemetry.read"], ["health", "Health", "health.read"],
  ["feeding", "Feeding & weight", "health.read"], ["training", "Training"], ["media", "Media & vision"]];
const reload = () => route();

export async function falconView(main, [id, tab = "overview"]) {
  const f = await api(`/falcons/${id}`);
  main.innerHTML = `<div class="head"><div><div class="small"><a href="#/falcons">Falcons</a> /</div><h1>${esc(f.name)} ${can("health.read") && f.alert_level > 1 ? lvl(f.alert_level) : ""}</h1>
      <div class="muted">${esc(f.code)} · ${esc(f.species || "Species not recorded")} · ${esc(f.sex)} · ${esc(f.category)}</div></div>
      <div class="row">${state(f.position_state, f.position_label)}${f.shared_with_me ? `<span class="badge">shared with you</span>` : ""}${can("recovery.write") && S.user.role !== "recovery" && !f.shared_with_me ? `<button class="sm" id="missing">Report missing</button>` : ""}</div></div>
    <div class="tabs">${TABS.filter((t) => !t[2] || can(t[2])).map(([k, l]) => `<a href="#/falcon/${id}/${k}" class="${k === tab ? "on" : ""}">${l}</a>`).join("")}</div><div id="tab"></div>`;
  const el = $("#tab");
  if ($("#missing")) $("#missing").onclick = guard(() => openCaseForm(f.id));
  await ({ overview, tracking, flights, health, feeding, training, media }[tab] || overview)(el, f);
}

// --- identity -------------------------------------------------------------------------------------
async function overview(el, f) {
  const [tl, lin, eq] = await Promise.all([api(`/falcons/${f.id}/timeline`), api(`/falcons/${f.id}/lineage`), can("device.read") ? api(`/falcons/${f.id}/equipment`) : []]);
  const R = f.identity_redacted ? `<span class="muted">restricted for your role</span>` : null;
  const age = f.hatch_date ? ((Date.now() - new Date(f.hatch_date)) / 31557600000).toFixed(1) + " years" : "—";
  const link = (p) => p ? `<a href="#/falcon/${p.id}">${esc(p.name)}</a> <span class="muted small">${esc(p.code)}</span>` : `<span class="muted">not recorded</span>`;
  el.innerHTML = `<div class="grid g21"><div>
    <div class="card"><div class="row"><h2 class="grow">Digital identity</h2>${can("falcon.write") ? `<button class="sm" id="edit">Edit</button>` : ""}</div>
      <dl class="kv"><dt>Falcon ID</dt><dd>${esc(f.code)}</dd><dt>Species</dt><dd>${esc(f.species || "—")}</dd><dt>Subspecies</dt><dd>${esc(f.subspecies || "—")}</dd>
      <dt>Breed / strain</dt><dd>${esc(f.strain || "—")}</dd><dt>Sex</dt><dd>${esc(f.sex)}</dd>
      <dt>Hatch date</dt><dd>${f.hatch_date ? day(f.hatch_date) : "—"} ${f.age_is_estimate ? prov("estimated") : ""} <span class="muted">(${age})</span></dd>
      <dt>Origin</dt><dd>${R || esc(f.origin || "—")}</dd><dt>Breeder</dt><dd>${R || esc(f.breeder || "—")}</dd>
      <dt>Owner</dt><dd>${R || esc(f.owner_name || "—")}</dd><dt>Current location</dt><dd>${esc(f.current_location || "—")}</dd>
      <dt>Ring / band</dt><dd>${R || esc(f.ring_number || "—")}</dd><dt>Microchip</dt><dd>${R || esc(f.microchip || "—")}</dd><dt>Passport</dt><dd>${R || esc(f.passport_no || "—")}</dd>
      <dt>Current weight</dt><dd>${f.latest_weight ? `${f.latest_weight.weight_g.toFixed(0)} g ${prov(f.latest_weight.provenance)} <span class="muted small">${dt(f.latest_weight.ts)}</span>` : "—"}</dd>
      <dt>Wingspan</dt><dd>${f.wingspan_cm ? f.wingspan_cm + " cm " + prov("user_observation") : "—"}</dd>
      <dt>Sire</dt><dd>${link(f.sire)}</dd><dt>Dam</dt><dd>${link(f.dam)}</dd>
      <dt>Offspring</dt><dd>${f.offspring.length ? f.offspring.map(link).join(", ") : `<span class="muted">none recorded</span>`}</dd>
      ${f.notes ? `<dt>Notes</dt><dd>${esc(f.notes)}</dd>` : ""}</dl>
      </div>
    <div class="card" style="margin-top:14px"><h2>Family tree</h2>${lin.tree && (lin.tree.sire || lin.tree.dam) ? `<div style="overflow:auto">${pedigreeSvg(lin.tree)}</div>` : `<div class="muted">No parents recorded for this falcon.</div>`}
      <div class="small muted" style="margin-top:8px">${esc(lin.note)} ${prov("derived")}</div></div>
    ${f.transfers ? `<div class="card" style="margin-top:14px"><div class="row"><h2 class="grow">Ownership &amp; transfer history</h2>${can("identity.write") ? `<button class="sm" id="xfer">Record transfer</button>` : ""}</div>
      ${f.transfers.length ? `<table><tr><th>Date</th><th>From</th><th>To</th><th>Document</th><th>Notes</th></tr>${f.transfers.map((t) => `<tr><td>${day(t.date)}</td><td>${esc(t.from_owner || "—")}</td><td>${esc(t.to_owner)}</td><td>${esc(t.document_ref || "—")}</td><td>${esc(t.notes || "")}</td></tr>`).join("")}</table>` : `<div class="muted">No transfers recorded.</div>`}</div>` : ""}
    ${can("device.read") ? `<div class="card" style="margin-top:14px"><h2>Equipment assigned</h2>${eq.length ? `<table><tr><th>Tracker</th><th>Mass</th><th>Share of body weight</th><th>Attachment</th><th>Professional review</th><th>Period</th></tr>
      ${eq.map((a) => `<tr><td>${esc(a.serial)}<div class="small muted">${esc(a.model || "")}</div></td><td>${a.mass_g ?? "—"} g</td><td>${a.mass_ratio ? (a.mass_ratio * 100).toFixed(1) + "% " + prov("derived") : "—"}</td><td>${esc(a.attachment_method || "—")}</td>
        <td><span class="badge">${esc(a.review_status)}</span>${a.review_notes ? `<div class="small muted">${esc(a.review_notes)}</div>` : ""}</td><td class="small">${day(a.start)} → ${a.end ? day(a.end) : "now"}</td></tr>`).join("")}</table>` : `<div class="muted">No tracker assigned. Assign one from <a href="#/devices">Devices</a>.</div>`}</div>` : ""}
    </div><div>
    ${can("identity.read") ? `<div class="card"><h2>QR identification</h2><div class="row"><div id="qr" style="width:128px;height:128px;background:#fff;border-radius:6px;padding:4px"></div>
      <div class="grow small muted">The code holds only an opaque token. Scanning it opens this record for signed-in, authorised users of your organisation; nothing about the bird is encoded in the image.<div style="margin-top:8px"><button class="sm" id="qrdl">Download SVG</button></div></div></div></div>` : ""}
    <div class="card" style="margin-top:14px"><div class="row"><h2 class="grow">Life timeline</h2>${can("falcon.write") ? `<button class="sm" id="tladd">Add event</button>` : ""}</div>
      <div class="scroll" style="max-height:560px"><div class="tl">${tl.map((e) => `<div><div class="small muted">${dt(e.ts)} · ${esc(e.kind)}</div>${e.ref_type === "flight" ? `<a href="#/flight/${e.ref_id}">${esc(e.title)}</a>` : esc(e.title)} ${prov(e.provenance)}${e.detail ? `<div class="small muted">${esc(e.detail)}</div>` : ""}</div>`).join("")}</div></div></div>
    </div></div>`;
  if ($("#qr")) api(`/falcons/${f.id}/qr.svg`).then((svg) => { $("#qr").innerHTML = svg.replace(/<\?xml.*?\?>/, ""); const s = $("#qr svg"); if (s) { s.setAttribute("width", "120"); s.setAttribute("height", "120"); } }).catch(() => {});
  if ($("#qrdl")) $("#qrdl").onclick = guard(() => openAuthed(`/falcons/${f.id}/qr.svg`, `${f.code}_qr.svg`));
  if ($("#edit")) $("#edit").onclick = () => formModal("Edit identity", [
    { name: "name", label: "Name", value: f.name, required: true },
    { name: "species_id", label: "Species profile", type: "select", value: f.species_id, options: [["", "— not recorded —"], ...S.meta.species.map((s) => [s.id, s.common_name])] },
    { name: "subspecies", label: "Subspecies", value: f.subspecies }, { name: "strain", label: "Breed / strain", value: f.strain },
    { name: "sex", label: "Sex", type: "select", value: f.sex, options: ["unknown", "female", "male"] },
    { name: "hatch_date", label: "Hatch date", type: "date", value: f.hatch_date }, { name: "age_is_estimate", label: "Date is an estimate", type: "checkbox", value: f.age_is_estimate },
    { name: "current_location", label: "Current location", value: f.current_location }, { name: "wingspan_cm", label: "Wingspan (cm)", type: "number", value: f.wingspan_cm },
    { name: "category", label: "Category", type: "select", value: f.category, options: ["hunting", "racing", "breeding", "display", "juvenile"] },
    ...(can("identity.write") ? [{ name: "ring_number", label: "Ring / band number", value: f.ring_number }, { name: "microchip", label: "Microchip", value: f.microchip }, { name: "passport_no", label: "Passport number", value: f.passport_no }] : []),
    { name: "notes", label: "Notes", type: "textarea", value: f.notes }],
  async (v) => { await api(`/falcons/${f.id}`, { method: "PATCH", body: v }); toast("Saved"); reload(); });
  if ($("#xfer")) $("#xfer").onclick = () => formModal("Record ownership transfer", [{ name: "to_owner", label: "New owner", required: true }, { name: "date", label: "Date", type: "date", required: true },
    { name: "document_ref", label: "Document reference" }, { name: "notes", label: "Notes", type: "textarea" }],
  async (v) => { await api(`/falcons/${f.id}/transfers`, { body: v }); reload(); });
  if ($("#tladd")) $("#tladd").onclick = () => formModal("Add timeline event", [{ name: "title", label: "Event", required: true }, { name: "kind", label: "Type", type: "select", options: ["note", "milestone", "moult", "travel", "competition"] },
    { name: "ts", label: "When", type: "datetime-local", value: nowLocal() }, { name: "detail", label: "Detail", type: "textarea" }],
  async (v) => { await api(`/falcons/${f.id}/timeline`, { body: v }); reload(); });
}

// --- tracking -------------------------------------------------------------------------------------
async function tracking(el, f) {
  el.innerHTML = `<div class="grid g21"><div><div id="map" class="map tall"></div>
      <div class="row small muted" style="margin-top:6px">Track history: <select id="hrs" style="width:auto"><option value="24">last 24 h</option><option value="72">3 days</option><option value="168" selected>7 days</option><option value="336">14 days</option></select>
      <span><span class="dot" style="background:#d2a24c"></span>historical track</span><span><span class="dot" style="background:#5fb37a"></span>current flight</span></div></div>
    <div><div class="card" id="st"></div>
      ${S.meta.demo && can("device.write") ? `<div class="card" style="margin-top:14px"><h2>Simulator scenario</h2><div class="small muted">Clearly labelled demonstration data. Streams a synthetic flight through the LoRa adapter and normal ingest path so you can watch live tracking.</div>
        <div class="row" style="margin-top:8px"><select id="kind" style="width:auto"><option value="normal_flight">Normal flight session</option><option value="long_distance">Long-distance flight</option><option value="high_altitude">High-altitude record</option><option value="unusual_movement">Unusual movement pattern</option><option value="signal_loss">Sudden loss of signal</option><option value="low_battery">Low device battery</option><option value="missing_falcon">Missing falcon and recovery case</option></select><button id="sim" class="primary">Start</button></div></div>` : ""}</div></div>`;
  const map = makeMap($("#map"));
  drawZones(map, S.meta.zones);
  let hist = L.layerGroup().addTo(map), live = L.layerGroup().addTo(map), centred = false;
  const loadHist = guard(async () => {
    hist.clearLayers();
    const pts = await api(`/falcons/${f.id}/track?hours=${$("#hrs").value}`);
    const segs = {};
    pts.filter((p) => p.q >= 0.3).forEach((p) => (segs[p.flight_id ?? "none"] ||= []).push([p.lat, p.lon]));
    Object.entries(segs).forEach(([k, s]) => k === "none" ? s.forEach((p) => L.circleMarker(p, { radius: 1.5, color: "#8a6a2e" }).addTo(hist))
      : L.polyline(s, { color: "#d2a24c", weight: 1.5, opacity: 0.55 }).addTo(hist).on("click", () => { location.hash = `#/flight/${k}`; }).bindTooltip("Open flight " + k));
    Object.values(segs).forEach((s) => { if (s.length > 2) { L.circleMarker(s[0], { radius: 4, color: "#5fb37a" }).bindTooltip("Launch").addTo(hist); L.circleMarker(s[s.length - 1], { radius: 4, color: "#6aa5d8" }).bindTooltip("Recovery").addTo(hist); } });
  });
  $("#hrs").onchange = loadHist;
  const draw = async () => {
    const p = await api(`/falcons/${f.id}/position`);
    live.clearLayers();
    const pos = p.position;
    $("#st").innerHTML = `<div class="row"><h2 class="grow">Tracker status</h2>${state(p.state, p.label)}</div>
      <div class="note ${p.state === "stale" ? "warn" : ""}">${esc(p.explain)}</div>
      ${pos ? `<dl class="kv"><dt>${p.state === "live" ? "Current reported position" : "Last known position"}</dt><dd>${pos.lat.toFixed(5)}, ${pos.lon.toFixed(5)} ${prov("measured")}</dd>
        <dt>Location timestamp</dt><dd>${dt(pos.ts)} <span class="muted">(${ago(p.age_s)})</span></dd>
        <dt>Altitude</dt><dd>${pos.alt_m != null ? `${num(pos.alt_m, 0)} m ${prov("measured")} <span class="small muted">${pos.alt_source === "baro" ? "barometric" : "GNSS"}</span>` : "—"}</dd>
        <dt>Ground speed</dt><dd>${pos.speed_mps != null ? `${num(pos.speed_mps)} m/s (${kmh(pos.speed_mps)}) ${prov("measured")}` : "—"}</dd>
        <dt>Heading</dt><dd>${pos.heading_deg != null ? num(pos.heading_deg, 0) + "° " + prov("measured") : "—"}</dd>
        <dt>Tracking accuracy</dt><dd>${pos.accuracy_m != null ? `±${pos.accuracy_m} m ${prov("estimated")} <span class="small muted">HDOP ${pos.hdop}${pos.sats ? `, ${pos.sats} satellites` : ""}</span>` : "not reported"}</dd>
        <dt>Data quality</dt><dd>${(pos.quality * 100).toFixed(0)}% ${prov("derived")} ${pos.flags ? `<span class="small muted">${esc(pos.flags)}</span>` : ""}</dd>
        ${p.live_flight ? `<dt>Flight duration</dt><dd>${dur(p.live_flight.duration_s)} ${prov("derived")}</dd><dt>Distance travelled</dt><dd>${dist(p.live_flight.distance_m)} ${prov("derived")}</dd>` : ""}</dl>` : ""}
      ${p.device ? `<h3>Device</h3><dl class="kv"><dt>Tracker</dt><dd>${esc(p.device.serial)} <span class="muted small">${esc(p.device.model || "")}</span></dd>
        <dt>Battery</dt><dd>${p.device.battery_pct != null ? num(p.device.battery_pct, 0) + "% " + prov("measured") : "—"}</dd>
        <dt>Connectivity</dt><dd>${p.device.last_seen ? `last report ${dt(p.device.last_seen)}` : "never reported"}${p.device.link ? ` via ${esc(p.device.link)}` : ""}${p.device.rssi != null ? ` · RSSI ${p.device.rssi} dBm` : ""}</dd>
        <dt>Fit review</dt><dd><span class="badge">${esc(p.assignment.review_status)}</span>${p.assignment.review_status === "pending" ? ` <span class="small" style="color:var(--warn)">awaiting professional review</span>` : ""}</dd></dl>` : ""}
      ${p.simulated ? `<div class="small muted" style="margin-top:6px">Position data for this bird is simulated.</div>` : ""}`;
    if (pos) {
      if (p.live_flight) L.polyline(p.live_flight.track, { color: "#5fb37a", weight: 3 }).addTo(live);
      L.marker([pos.lat, pos.lon], { icon: dotIcon(STATE_COLOR[p.state] || "#999", p.state === "live"), opacity: p.state === "stale" ? 0.7 : 1 })
        .bindTooltip(`${esc(p.label)} · ${ago(p.age_s)}`, { permanent: true, direction: "top", offset: [0, -8] }).addTo(live);
      if (pos.accuracy_m) L.circle([pos.lat, pos.lon], { radius: pos.accuracy_m, color: "#6aa5d8", weight: 1, fillOpacity: 0.1 }).addTo(live);
      if (!centred || p.state === "live") { map.setView([pos.lat, pos.lon], centred ? map.getZoom() : 14); centred = true; }
    }
  };
  await draw();
  await loadHist();
  every(2000, draw);
  if ($("#sim")) $("#sim").onclick = guard(async () => { const r = await api("/simulator/run", { body: { falcon_id: f.id, scenario: $("#kind").value } }); toast(`${r.label}: ${r.note}`); });
}

// --- flights & performance --------------------------------------------------------------------------
async function flights(el, f) {
  const [fl, perf] = await Promise.all([api(`/falcons/${f.id}/flights`), api(`/falcons/${f.id}/performance`)]);
  const importBtn = can("device.write") ? `<button id="imp">Import track file</button>` : "";
  const bindImport = () => { if ($("#imp")) $("#imp").onclick = () => importForm(f); };
  if (!fl.length) { el.innerHTML = `<div class="card"><div class="row"><span class="grow muted">No tracked flights yet. Flights appear automatically when an assigned tracker reports movement, or you can import a track exported from a tracker app.</span>${importBtn}</div></div>`; bindImport(); return; }
  const keys = ["duration_s", "max_height_m", "distance_m", "max_speed_mps", "climb_rate_mps", "activity_index"];
  el.innerHTML = `<div class="row" style="margin-bottom:10px"><div class="grow">${provLegend()}</div>${importBtn}</div>
    <div class="note">${esc(perf.note)}</div>
    <div class="grid g2"><div class="card"><div class="row"><h2 class="grow">Flight history against own baseline</h2><select id="mk" style="width:auto">${keys.map((k) => `<option value="${k}">${esc(perf.labels[k])}</option>`).join("")}</select></div>
        <div class="chartbox"><canvas id="c1"></canvas></div><div class="small muted" id="c1n"></div></div>
      <div class="card"><h2>Trend over recent flights ${prov("ai_interpretation")}</h2>
        ${perf.trends.length ? `<table><tr><th>Metric</th><th>Flights</th><th>Estimated change</th><th></th></tr>${perf.trends.filter((t) => t.direction !== "no clear trend").map((t) => `<tr><td>${esc(t.label)}<div class="small muted">${esc(t.pattern)}</div></td><td>${t.flights}</td><td>${t.change_pct > 0 ? "+" : ""}${t.change_pct}%</td><td><span class="badge">${t.direction}</span></td></tr>`).join("")}</table>` : `<div class="muted">Not enough flights for a trend.</div>`}
        <h3>Typical flight patterns ${prov("ai_interpretation")}</h3>${perf.patterns.map((p) => `<div class="row"><span class="grow">${esc(p.label)}</span><b>${p.count}</b></div>`).join("")}</div></div>
    ${perf.recent_deviations.length ? `<div class="card" style="margin-top:14px"><h2>Recent deviations from this bird's baseline ${prov("ai_interpretation")}</h2><table><tr><th>Flight</th><th>Metric</th><th>Value</th><th>Own typical range</th><th>Status</th><th>Confidence</th></tr>
      ${perf.recent_deviations.flatMap((d) => d.deviations.map((c) => `<tr class="click" data-go="#/flight/${d.flight_id}"><td>${dt(d.start)}</td><td>${esc(c.label)}</td><td>${c.value} ${esc(c.unit)}</td><td>${c.typical_low} – ${c.typical_high}</td><td><span class="badge">${c.status}, ${c.direction}</span></td><td>${(c.confidence * 100).toFixed(0)}%</td></tr>`)).join("")}</table>
      <div class="small muted">A deviation is a statistical observation about recorded data. It does not explain why the flight differed.</div></div>` : ""}
    <div class="card" style="margin-top:14px"><div class="row"><h2 class="grow">Recorded flights (${fl.length})</h2><span class="small muted">Select two to compare</span><button class="sm" id="cmp" disabled>Compare</button></div>
      <div class="scroll" style="max-height:520px"><table><tr><th></th><th>Start</th><th>Duration</th><th>Distance</th><th>Max height</th><th>Peak speed</th><th>Pattern</th><th>Data quality</th></tr>
      ${fl.map((x) => `<tr class="click" data-go="#/flight/${x.id}"><td><input type="checkbox" data-c="${x.id}"></td><td class="nowrap">${dt(x.start)}${x.simulated ? ` <span class="badge">simulated</span>` : ""}${x.source ? ` <span class="badge" title="${esc(x.source.label)} · ${esc(x.source.filename)}">imported</span>` : ""}</td>
        <td>${dur(x.metrics.duration_s?.value)}</td><td>${dist(x.metrics.distance_m?.value)}</td><td>${x.metrics.max_height_m ? num(x.metrics.max_height_m.value, 0) + " m" : "—"}</td>
        <td>${kmh(x.metrics.max_speed_mps?.value)}</td><td class="small">${esc(x.pattern.label)}</td><td>${((x.data_quality || 0) * 100).toFixed(0)}%</td></tr>`).join("")}</table></div></div>`;
  bindImport();
  $$("[data-go]", el).forEach((r) => r.onclick = (e) => { if (e.target.tagName !== "INPUT") location.hash = r.dataset.go; });
  const sel = () => $$("[data-c]:checked", el).map((c) => c.dataset.c);
  $$("[data-c]", el).forEach((c) => c.onchange = () => { $("#cmp").disabled = sel().length !== 2; });
  $("#cmp").onclick = guard(async () => {
    const [b, a] = sel();
    const c = await api(`/flights/compare/${a}/${b}`);
    infoModal("Flight comparison — same falcon", `<div class="small muted">A: ${dt(c.a.start)} · B: ${dt(c.b.start)}</div><table><tr><th>Metric</th><th>A</th><th>B</th><th>Change</th><th>Source</th></tr>
      ${c.rows.map((r) => `<tr><td>${esc(r.label)}</td><td>${r.a} ${esc(r.unit)}</td><td>${r.b} ${esc(r.unit)}</td><td>${r.change_pct == null ? "—" : (r.change_pct > 0 ? "+" : "") + r.change_pct + "%"}</td><td>${prov(r.provenance)}</td></tr>`).join("")}</table>`);
  });
  let ch;
  const drawChart = () => {
    const k = $("#mk").value, b = perf.baseline[k];
    const xs = perf.series.map((s) => day(s.start).slice(0, 6)), ys = perf.series.map((s) => s[k]);
    ch?.destroy();
    const band = (v, label, c) => ({ label, data: xs.map(() => v), borderColor: c, borderDash: [5, 5], pointRadius: 0, borderWidth: 1 });
    ch = chart($("#c1"), { type: "line", data: { labels: xs, datasets: [{ label: perf.labels[k], data: ys, borderColor: "#d2a24c", backgroundColor: "#d2a24c", pointRadius: 2.5, borderWidth: 1.5, tension: 0.2 },
      ...(b ? [band(b.median, "Own median", "#58b8a6"), band(b.p10, "Own typical low (P10)", "#6b665b"), band(b.p90, "Own typical high (P90)", "#6b665b")] : [])] } });
    $("#c1n").textContent = b ? `Baseline from ${b.n} flights of this bird (confidence ${(perf.baseline_confidence * 100).toFixed(0)}%).` : `No baseline yet — needs at least ${perf.min_flights} flights.`;
  };
  $("#mk").onchange = drawChart;
  drawChart();
}

function importForm(f) {
  formModal(`Import a recorded flight for ${f.name}`, [
    { name: "file", label: "Track file (GPX, KML, KMZ or CSV)", type: "file", required: true, accept: ".gpx,.kml,.kmz,.csv,.txt" },
    { name: "source", label: "Tracker or app it came from", placeholder: "e.g. the name of the tracker app", required: true },
    { name: "utc_offset_hours", label: "Time zone of the file, hours from UTC (only used if times in the file have no zone)", type: "number", value: 4,
      help: "UAE time is +4. GPX files normally carry UTC already and ignore this." }],
  async (v) => {
    const fd = new FormData(); fd.append("file", v.file); fd.append("source", v.source || ""); fd.append("utc_offset_hours", v.utc_offset_hours ?? 0);
    const r = await api(`/falcons/${f.id}/import-track`, { body: fd });
    setTimeout(() => { const m = infoModal("Import result", `<dl class="kv"><dt>File</dt><dd>${esc(r.filename)} (${esc(r.format)})</dd><dt>Period</dt><dd>${dt(r.from)} → ${dt(r.to)}</dd>
      <dt>Points in file</dt><dd>${r.points_in_file}</dd><dt>Imported</dt><dd>${r.accepted}${r.duplicates_skipped ? ` · ${r.duplicates_skipped} already stored, skipped` : ""}</dd>
      <dt>Flagged low quality</dt><dd>${r.flagged}</dd><dt>Flights detected</dt><dd>${r.flights.length ? r.flights.map((x) => `<a href="#/flight/${x.id}">${dt(x.start)} · ${dur(x.duration_s)}</a>`).join("<br>") : "none"}</dd></dl>
      ${r.notes.length ? `<h3>How the file was read</h3>${r.notes.map((n) => `<div class="note">${esc(n)}</div>`).join("")}` : ""}`);
      $("[data-x]", m).addEventListener("click", reload); $$("a", m).forEach((a) => a.addEventListener("click", () => { $("#modal-root").innerHTML = ""; })); }, 0);
  }, { intro: `<div class="note">Use this for flights recorded by a tracker app that can export a track. Imported flights are labelled as imported and never shown as a live position. Check you have the right falcon selected: <b>${esc(f.name)}</b>.<br>No file to hand? Download a synthetic sample: <a href="samples/sample_flight.gpx" download>GPX</a> or <a href="samples/sample_flight.csv" download>CSV</a>.</div>`, submit: "Import" });
}

// --- health ---------------------------------------------------------------------------------------
const KINDS_VET = [["exam", "Veterinary examination"], ["medication", "Medication record"], ["vaccination", "Vaccination"], ["lab", "Laboratory report"], ["treatment", "Treatment"], ["recommendation", "Veterinary recommendation"]];
const KINDS_ALL = [["observation", "Observation"], ["injury", "Injury"], ["recovery", "Recovery note"], ["followup", "Follow-up appointment"], ["development", "Development note"]];

async function health(el, f) {
  const h = await api(`/falcons/${f.id}/health`);
  const open = h.alerts.filter((a) => ["open", "acknowledged", "reviewed"].includes(a.status));
  const past = h.alerts.filter((a) => !["open", "acknowledged", "reviewed"].includes(a.status));
  el.innerHTML = `<div class="row" style="margin-bottom:10px"><div class="grow">${provLegend()}</div><button id="reeval" class="sm">Re-check now</button>${can("health.write") ? `<button id="addrec" class="primary">Add record</button>` : ""}</div>
    <div class="note">${esc(h.disclaimer)}</div>
    <div class="grid g2"><div><h2>Current observations</h2><div id="al"></div>
      ${past.length ? `<h3>Closed observations</h3>${past.slice(0, 8).map((a) => `<div class="small muted">${lvl(a.level)} ${esc(a.title)} — ${esc(a.status)} ${dt(a.updated)}</div>`).join("")}` : ""}</div>
    <div><h2>Health &amp; veterinary records</h2><div class="card"><div class="scroll" style="max-height:640px">
      ${h.records.length ? h.records.map((r) => `<div style="padding:8px 0;border-bottom:1px solid var(--line)"><div class="row"><span class="badge">${esc(r.kind)}</span><b class="grow">${esc(r.title)}</b>${prov(r.provenance)}</div>
        ${r.detail ? `<div class="small" style="white-space:pre-line">${esc(r.detail)}</div>` : ""}
        <div class="small muted">${dt(r.ts)} · ${esc(r.recorder_name || "")}${r.severity ? ` · severity: ${esc(r.severity)}` : ""}${r.due_date ? ` · due ${day(r.due_date)}` : ""}
        ${["followup", "injury"].includes(r.kind) ? (r.done ? ` · <b style="color:var(--ok)">${r.kind === "injury" ? "resolved" : "done"}</b>` : ` · <a href="#" data-done="${r.id}">mark ${r.kind === "injury" ? "resolved" : "done"}</a>`) : ""}</div></div>`).join("") : `<div class="muted">No records.</div>`}</div></div></div></div>`;
  open.forEach((a) => $("#al").append(alertCard(a, { onChange: reload })));
  $("#reeval").onclick = guard(async () => { await api(`/falcons/${f.id}/evaluate`, { body: {} }); reload(); });
  $$("[data-done]", el).forEach((a) => a.onclick = guard(async (e) => { e.preventDefault(); await api(`/health-records/${a.dataset.done}`, { method: "PATCH", body: { done: true } }); reload(); }));
  if ($("#addrec")) $("#addrec").onclick = () => formModal("Add health record", [
    { name: "kind", label: "Record type", type: "select", options: [...(h.can_clinical ? KINDS_VET : []), ...KINDS_ALL] },
    { name: "title", label: "Summary", required: true }, { name: "detail", label: "Detail", type: "textarea" },
    { name: "severity", label: "Severity (injuries only)", type: "select", options: [["", "—"], "minor", "moderate", "severe"] },
    { name: "due_date", label: "Due date (follow-ups only)", type: "date" }, { name: "ts", label: "When", type: "datetime-local", value: nowLocal() }],
  async (v) => { await api(`/falcons/${f.id}/health-records`, { body: v }); toast("Record added"); reload(); },
  { intro: h.can_clinical ? "" : `<div class="note">Examinations, medication, laboratory and treatment records are entered by veterinary professionals. You can upload the clinic's document under Media.</div>` });
}

// --- feeding & weight -----------------------------------------------------------------------------
async function feeding(el, f) {
  const d = await api(`/falcons/${f.id}/feeding?days=60`);
  const t = d.target, plan = d.plans.find((p) => p.active);
  el.innerHTML = `<div class="note">${esc(d.policy)}</div>
    <div class="grid g21"><div class="card"><div class="row"><h2 class="grow">Weight history</h2>${d.can_write ? `<button class="primary" id="addw">Record weight</button>` : ""}</div>
      <div class="chartbox" style="height:280px"><canvas id="wc"></canvas></div>
      ${d.stats ? `<div class="small muted">Median ${d.stats.median_g} g · range ${d.stats.min_g}–${d.stats.max_g} g · last 7 days mean ${d.stats.last7_mean_g ?? "—"} g ${prov("derived")} · ${d.stats.n} weighings ${prov("user_observation")}</div>` : ""}</div>
    <div><div class="card"><div class="row"><h2 class="grow">Veterinary target range</h2>${d.can_set_target ? `<button class="sm" id="sett">Set range</button>` : ""}</div>
        ${t ? `<div style="font-size:22px;font-weight:650">${t.min_g.toFixed(0)} – ${t.max_g.toFixed(0)} g</div><div class="small muted">${prov("vet_assessment")} set ${day(t.set_at)}${t.context ? ` · ${esc(t.context)}` : ""}${t.note ? ` · ${esc(t.note)}` : ""}</div>`
    : `<div class="muted">No target range set. Only a veterinary professional can set one.</div>`}</div>
      <div class="card" style="margin-top:14px"><div class="row"><h2 class="grow">Feeding plan</h2>${d.can_write ? `<button class="sm" id="addp">New plan</button>` : ""}</div>
        ${plan ? `<b>${esc(plan.title)}</b><div class="small muted">Written by a ${esc(plan.author_role)} · ${plan.vet_approved_by ? `<span style="color:var(--ok)">reviewed by a veterinary professional</span>` : `not yet reviewed by a vet ${d.can_set_target ? `<a href="#" id="appr">— mark reviewed</a>` : ""}`}</div>
          ${(plan.schedule || []).length ? `<table>${plan.schedule.map((s) => `<tr><td>${esc(s.time || "")}</td><td>${esc(s.food_type || "")}</td><td>${s.quantity_g ? s.quantity_g + " g" : ""}</td><td class="small muted">${esc(s.note || "")}</td></tr>`).join("")}</table>` : ""}
          ${plan.notes ? `<div class="small">${esc(plan.notes)}</div>` : ""}` : `<div class="muted">No feeding plan recorded.</div>`}</div></div></div>
    <div class="card" style="margin-top:14px"><div class="row"><h2 class="grow">Feeding history</h2>${d.can_write ? `<button class="primary" id="addf">Record feeding</button>` : ""}</div>
      <div class="scroll"><table><tr><th>When</th><th>Food</th><th>Quantity</th><th>Observations</th></tr>${d.feedings.map((x) => `<tr><td class="nowrap">${dt(x.ts)}</td><td>${esc(x.food_type)}</td><td>${x.quantity_g != null ? x.quantity_g + " g" : "—"}</td><td>${esc(x.observations || "")}</td></tr>`).join("")}</table></div></div>`;
  const labels = d.weights.map((w) => day(w.ts).slice(0, 6));
  chart($("#wc"), { type: "line", data: { labels, datasets: [
    { label: "Recorded weight (g)", data: d.weights.map((w) => w.weight_g), borderColor: "#d2a24c", backgroundColor: "#d2a24c", pointRadius: 2.5, borderWidth: 1.5 },
    ...(t ? [{ label: "Vet target min", data: labels.map(() => t.min_g), borderColor: "#5fb37a", borderDash: [5, 5], pointRadius: 0, borderWidth: 1 },
      { label: "Vet target max", data: labels.map(() => t.max_g), borderColor: "#5fb37a", borderDash: [5, 5], pointRadius: 0, borderWidth: 1, fill: "-1", backgroundColor: "rgba(95,179,122,.08)" }] : [])] } });
  if ($("#addw")) $("#addw").onclick = () => formModal("Record weight", [{ name: "weight_g", label: "Weight (g)", type: "number", required: true },
    { name: "context", label: "Context", type: "select", options: ["pre-flight", "morning", "post-feed", "evening", "clinic"] }, { name: "ts", label: "When", type: "datetime-local", value: nowLocal() }, { name: "note", label: "Note" }],
  async (v) => { await api(`/falcons/${f.id}/weights`, { body: v }); toast("Weight recorded"); reload(); });
  if ($("#addf")) $("#addf").onclick = () => formModal("Record feeding", [{ name: "food_type", label: "Food type", required: true, placeholder: "quail, pigeon, day-old chick…" },
    { name: "quantity_g", label: "Quantity (g)", type: "number" }, { name: "ts", label: "When", type: "datetime-local", value: nowLocal() }, { name: "observations", label: "Observations", type: "textarea" }],
  async (v) => { await api(`/falcons/${f.id}/feedings`, { body: v }); reload(); });
  if ($("#sett")) $("#sett").onclick = () => formModal("Set veterinary target range", [{ name: "min_g", label: "Minimum (g)", type: "number", required: true, value: t?.min_g }, { name: "max_g", label: "Maximum (g)", type: "number", required: true, value: t?.max_g },
    { name: "context", label: "Applies to", placeholder: "Flying season, moult…" }, { name: "note", label: "Note" }],
  async (v) => { await api(`/falcons/${f.id}/target-range`, { body: v }); reload(); });
  if ($("#addp")) $("#addp").onclick = () => formModal("New feeding plan", [{ name: "title", label: "Plan title", required: true }, { name: "start_date", label: "Start", type: "date" },
    { name: "lines", label: "Schedule — one line per meal: time, food, grams, note", type: "textarea", placeholder: "08:00, quail, 90, after flight" }, { name: "notes", label: "Notes", type: "textarea" }],
  async (v) => { const schedule = (v.lines || "").split("\n").map((l) => l.split(",").map((s) => s.trim())).filter((p) => p[0]).map(([time, food_type, q, note]) => ({ time, food_type, quantity_g: Number(q) || null, note }));
    await api(`/falcons/${f.id}/feeding-plans`, { body: { title: v.title, start_date: v.start_date, notes: v.notes, schedule } }); reload(); },
  { intro: `<div class="note">This plan is your professional decision. The platform stores it and never edits it.</div>` });
  if ($("#appr")) $("#appr").onclick = guard(async (e) => { e.preventDefault(); await api(`/feeding-plans/${plan.id}/approve`, { body: {} }); reload(); });
}

// --- training -------------------------------------------------------------------------------------
async function training(el, f) {
  const d = await api(`/falcons/${f.id}/training`);
  const a = d.analytics;
  el.innerHTML = `<div class="row" style="margin-bottom:12px"><div class="grow"></div>${can("report") ? `<button id="csv">Export CSV</button>` : ""}<button id="cmp">Compare two periods</button>${can("training.write") ? `<button class="primary" id="add">Log session</button>` : ""}</div>
    ${a.weeks ? `<div class="grid g2"><div class="card"><h2>Weekly training load ${prov("derived")}</h2><div class="chartbox"><canvas id="tc"></canvas></div></div>
      <div class="card"><h2>Consistency &amp; outcomes ${prov("derived")}</h2><dl class="kv"><dt>Days with a session</dt><dd>${a.consistency.days_with_session} of ${a.consistency.span_days} (${(a.consistency.share * 100).toFixed(0)}%)</dd>
        <dt>Longest gap</dt><dd>${a.consistency.longest_gap_days} days</dd><dt>Outcomes</dt><dd>${Object.entries(a.outcomes).map(([k, v]) => `${esc(k)}: <b>${v}</b>`).join(" · ")}</dd>
        <dt>Training types</dt><dd>${Object.entries(a.types).map(([k, v]) => `${esc(k)}: <b>${v}</b>`).join("<br>")}</dd></dl></div></div>` : ""}
    <div class="card" style="margin-top:14px"><h2>Sessions (${d.sessions.length})</h2><div class="scroll" style="max-height:560px"><table><tr><th>Date</th><th>Type</th><th>Trainer</th><th>Location</th><th>Duration</th><th>Conditions</th><th>Tracked flight</th><th>Outcome</th><th>Observations</th></tr>
      ${d.sessions.map((s) => { const c = s.conditions || {}; return `<tr><td class="nowrap">${dt(s.start)}</td><td>${esc(s.type)}</td><td>${esc(s.trainer_name || "")}</td><td>${esc(s.location || "")}</td><td>${s.duration_min != null ? s.duration_min + " min" : "—"}</td>
        <td class="small">${c.temp_c != null ? c.temp_c + " °C" : ""}${c.wind_kph != null ? ` · wind ${c.wind_kph} km/h ${esc(c.wind_dir || "")}` : ""}${c.sky ? ` · ${esc(c.sky)}` : ""}</td>
        <td>${s.flight ? `<a href="#/flight/${s.flight.id}">${dur(s.flight.duration_s)}</a>` : `<span class="muted">—</span>`}</td><td><span class="badge">${esc(s.outcome || "—")}</span></td>
        <td class="small">${esc(s.observations || "")}${s.recovery_observation ? `<div class="muted">Recovery: ${esc(s.recovery_observation)}</div>` : ""}</td></tr>`; }).join("")}</table></div></div>`;
  if (a.weeks) chart($("#tc"), { data: { labels: a.weeks.map((w) => w.week), datasets: [
    { type: "bar", label: "Sessions", data: a.weeks.map((w) => w.sessions), backgroundColor: "#8a6a2e" }, { type: "bar", label: "Completed", data: a.weeks.map((w) => w.completed), backgroundColor: "#5fb37a" },
    { type: "line", label: "Median tracked flight (s)", data: a.weeks.map((w) => w.median_flight_s), borderColor: "#6aa5d8", yAxisID: "y2", pointRadius: 3 }] },
  options: { scales: { y2: { position: "right", ticks: { color: "#a09a8c" }, grid: { display: false } } } } });
  if ($("#csv")) $("#csv").onclick = guard(() => openAuthed(`/falcons/${f.id}/training.csv`, `training_${f.code}.csv`));
  const iso = (d_) => d_.toISOString().slice(0, 10), D = 86400000, n = Date.now();
  $("#cmp").onclick = () => formModal("Compare two training periods — same falcon", [
    { name: "a_from", label: "Period A from", type: "date", value: iso(new Date(n - 28 * D)), required: true }, { name: "a_to", label: "Period A to", type: "date", value: iso(new Date(n - 15 * D)), required: true },
    { name: "b_from", label: "Period B from", type: "date", value: iso(new Date(n - 14 * D)), required: true }, { name: "b_to", label: "Period B to", type: "date", value: iso(new Date(n)), required: true }],
  async (v) => { const c = await api(`/falcons/${f.id}/training/compare?` + new URLSearchParams(v));
    setTimeout(() => infoModal("Training period comparison", `<table><tr><th></th><th>A: ${day(c.a.from)} – ${day(c.a.to)}</th><th>B: ${day(c.b.from)} – ${day(c.b.to)}</th><th>Change</th></tr>
      <tr><td>Sessions (completed)</td><td>${c.a.sessions} (${c.a.completed})</td><td>${c.b.sessions} (${c.b.completed})</td><td></td></tr><tr><td>Tracked flights</td><td>${c.a.flights}</td><td>${c.b.flights}</td><td></td></tr>
      ${c.rows.map((r) => `<tr><td>${esc(r.label)} (median)</td><td>${r.a ?? "—"}</td><td>${r.b ?? "—"}</td><td>${r.change_pct == null ? "—" : (r.change_pct > 0 ? "+" : "") + r.change_pct + "%"}</td></tr>`).join("")}</table><div class="note">${esc(c.note)} ${prov("derived")}</div>`), 0); }, { submit: "Compare" });
  if ($("#add")) $("#add").onclick = () => formModal("Log training session", [
    { name: "type", label: "Training type", required: true, placeholder: "lure flying, waiting-on, drone-lure pursuit, rest day…" }, { name: "start", label: "Date and time", type: "datetime-local", value: nowLocal() },
    { name: "duration_min", label: "Session duration (min)", type: "number" }, { name: "location", label: "Location" },
    { name: "temp_c", label: "Temperature (°C)", type: "number" }, { name: "wind_kph", label: "Wind (km/h)", type: "number" }, { name: "sky", label: "Sky", type: "select", options: ["", "clear", "haze", "scattered cloud", "overcast", "dust"] },
    { name: "outcome", label: "Outcome", type: "select", options: ["completed", "shortened", "declined", "cancelled"] },
    { name: "observations", label: "Performance observations", type: "textarea" }, { name: "recovery_observation", label: "Recovery observations", type: "textarea" }, { name: "notes", label: "Trainer notes", type: "textarea" }],
  async (v) => { const { temp_c, wind_kph, sky, ...rest } = v; await api(`/falcons/${f.id}/training`, { body: { ...rest, conditions: { temp_c, wind_kph, sky } } }); toast("Session logged — a tracked flight in the same window is linked automatically"); reload(); });
}

// --- media & vision ---------------------------------------------------------------------------------
export function visionResult(v) {
  const r = v.result;
  let body = "";
  if (v.task === "image_quality") body = `<dl class="kv"><dt>Resolution</dt><dd>${r.width} × ${r.height}</dd><dt>Sharpness</dt><dd>${r.sharpness}</dd><dt>Brightness / contrast</dt><dd>${r.brightness} / ${r.contrast}</dd>
    <dt>Issues</dt><dd>${r.issues.length ? esc(r.issues.join("; ")) : "none found"}</dd><dt>Usable for observation</dt><dd>${r.usable_for_observation ? "yes" : "no — retake if possible"}</dd></dl>`;
  else if (v.task === "identity_candidates") body = `<table><tr><th>Candidate</th><th>Appearance similarity</th><th>Human verification</th></tr>${r.candidates.map((c) => `<tr><td><a href="#/falcon/${c.falcon_id}">${esc(c.name)}</a></td><td>${c.similarity}</td>
      <td>${v.human_verdict ? "" : `<button class="sm" data-verdict="confirmed" data-f="${c.falcon_id}">Confirm</button>`}</td></tr>`).join("")}</table>
      ${v.human_verdict ? `<div class="small">Human verdict: <b>${esc(v.human_verdict)}</b>${r.confirmed_falcon_id ? ` (falcon ${r.confirmed_falcon_id})` : ""}</div>` : `<button class="sm" data-verdict="rejected">None of these</button> <button class="sm" data-verdict="unsure">Unsure</button>`}`;
  else if (v.task === "detection") body = r.status === "ok" ? `<table>${r.detections.map((d) => `<tr><td>${esc(d.label)}</td><td>${(d.confidence * 100).toFixed(0)}%</td></tr>`).join("") || "<tr><td>No detections</td></tr>"}</table>` : `<div class="muted">No detection model installed (${esc(r.status)}).</div>`;
  else if (v.task === "video_motion") body = r.status !== "ok" ? `<div class="muted">${esc(r.status)}</div>` : `<dl class="kv"><dt>Analysed</dt><dd>${r.analysed_seconds} s at ${r.sample_fps} fps</dd><dt>Visible activity</dt><dd>${r.active_seconds} s (${(r.active_share * 100).toFixed(0)}%) ${prov("estimated")}</dd>
      <dt>Wing movement</dt><dd>${r.wing_movement ? `≈ ${r.wing_movement.estimated_hz} Hz periodic motion ${prov("estimated")}` : "no clear periodic motion found"}</dd><dt>Camera motion</dt><dd>${(r.camera_motion_share * 100).toFixed(0)}% of frames</dd></dl>
      <h3>Motion segments</h3>${r.segments.map((s) => `<div class="small">${s.start_s}–${s.end_s} s${s.direction ? ` · moving ${esc(s.direction)}` : ""}</div>`).join("") || `<div class="small muted">none</div>`}
      <h3>Possible take-off / landing events (verify by eye)</h3>${r.events.map((e) => `<div class="small">${e.t_s} s — ${esc(e.label)}</div>`).join("") || `<div class="small muted">none</div>`}`;
  return `<div class="card" style="margin-top:10px" data-vid="${v.id}"><div class="row"><b class="grow">${esc(v.task.replace(/_/g, " "))}</b>${prov("ai_interpretation")}<span class="badge" style="color:${v.validated ? "var(--ok)" : "var(--warn)"}">${v.validated ? "validated method" : "UNVALIDATED"}</span>
    ${v.confidence != null ? `<span class="badge">confidence ${(v.confidence * 100).toFixed(0)}%</span>` : `<span class="badge">no confidence available</span>`}</div>
    <div class="small muted">${esc(v.backend)} · ${dt(v.created)}</div>${body}<div class="note"><b>Limitations.</b> ${esc(v.limitations)}</div></div>`;
}

async function media(el, f) {
  const atts = await api(`/falcons/${f.id}/attachments`);
  const photos = atts.filter((a) => a.kind === "photo"), videos = atts.filter((a) => a.kind === "video"), docs = atts.filter((a) => a.kind === "document");
  el.innerHTML = `<div class="row" style="margin-bottom:12px"><div class="grow small muted">Image and video tools are observation aids, not veterinary diagnostic tools. Every result states its confidence and limitations.</div>${can("falcon.write") ? `<button class="primary" id="up">Upload</button>` : ""}</div>
    <div class="grid g21"><div><div class="card"><h2>Photograph gallery</h2><div class="gallery">${photos.map((a) => `<img data-att="${a.id}" data-pick="${a.id}" title="${esc(a.filename)}">`).join("") || `<span class="muted">No photographs.</span>`}</div></div>
      <div class="card" style="margin-top:14px"><h2>Videos</h2>${videos.map((a) => `<div class="row"><span class="grow">${esc(a.filename)} <span class="muted small">${(a.size / 1e6).toFixed(1)} MB</span></span>${can("vision.use") ? `<button class="sm" data-video="${a.id}">Analyse motion</button>` : ""}</div>`).join("") || `<span class="muted">No videos. Upload a flight or training clip to analyse visible activity.</span>`}</div>
      <div class="card" style="margin-top:14px"><h2>Documents</h2>${docs.map((a) => `<div class="row"><a href="#" data-doc="${a.id}" class="grow">${esc(a.filename)}</a><span class="badge">${esc(a.category || "")}</span>${a.restricted ? `<span class="badge">restricted</span>` : ""}<span class="small muted">${day(a.created)}</span></div>`).join("") || `<span class="muted">No documents.</span>`}</div></div>
    <div><div class="card"><h2>Selected photo</h2><div id="sel" class="muted">Select a photo to run observation tools.</div></div><div id="res"></div></div></div>`;
  hydrateImages(el);
  const res = $("#res");
  const show = (v) => { res.insertAdjacentHTML("afterbegin", visionResult(v));
    $$(`[data-vid="${v.id}"] [data-verdict]`, res).forEach((b) => b.onclick = guard(async () => { const nv = await api(`/vision/analyses/${v.id}/verdict`, { body: { verdict: b.dataset.verdict, falcon_id: +b.dataset.f || null } });
      $(`[data-vid="${v.id}"]`, res).remove(); show(nv); toast("Human verification recorded"); })); };
  const run = guard(async (aid, task) => { toast("Analysing…"); show(await api("/vision/analyze", { body: { attachment_id: aid, task } })); });
  $$("[data-pick]", el).forEach((img) => img.onclick = async () => {
    const aid = +img.dataset.pick;
    $("#sel").innerHTML = `<img src="${await blobUrl(aid)}" style="width:100%;border-radius:8px"><div class="row" style="margin-top:8px">
      ${can("vision.use") ? `<button class="sm" data-t="image_quality">Image quality</button><button class="sm" data-t="identity_candidates">Possible identity matches</button><button class="sm" data-t="detection">Detect / classify</button>` : ""}
      ${can("health.write") ? `<button class="sm" id="phys">Record physical observation</button>` : ""}${can("dataset.write") ? `<button class="sm" id="ds">Add to training dataset</button>` : ""}</div>`;
    $$("[data-t]", el).forEach((b) => b.onclick = () => run(aid, b.dataset.t));
    if ($("#phys")) $("#phys").onclick = () => formModal("Physical observation from this photograph", [...S.meta.physical_checklist.map((c) => ({ name: c.key, label: c.label, type: "select", options: ["", ...c.options] })), { name: "note", label: "Note", type: "textarea" }],
      async (v) => { const { note, ...answers } = v; Object.keys(answers).forEach((k) => answers[k] || delete answers[k]);
        await api(`/falcons/${f.id}/physical-observation`, { body: { answers, note, attachment_id: aid } }); toast("Saved to the health record as your observation"); },
      { intro: `<div class="note">You are recording what <b>you</b> see. No validated model for feather, posture or body-condition assessment is installed, so nothing here is produced by AI. This is not a clinical assessment unless entered by a veterinary professional.</div>` });
    if ($("#ds")) $("#ds").onclick = () => formModal("Add to model-training dataset", [{ name: "consent", label: "The owner consents to this image being used to train and evaluate falcon models", type: "checkbox" }],
      async (v) => { await api("/dataset", { body: { attachment_id: aid, consent: v.consent } }); toast("Added — label it in the Vision lab"); });
  });
  $$("[data-video]", el).forEach((b) => b.onclick = () => run(+b.dataset.video, "video_motion"));
  $$("[data-doc]", el).forEach((a) => a.onclick = guard(async (e) => { e.preventDefault(); await openAuthed(`/attachments/${a.dataset.doc}/file`); }));
  if ($("#up")) $("#up").onclick = () => formModal("Upload file", [{ name: "file", label: "File", type: "file", required: true, accept: "image/*,video/*,application/pdf" },
    { name: "kind", label: "Kind", type: "select", options: ["photo", "video", "document"] },
    { name: "category", label: "Category", type: "select", options: ["gallery", "reference", "training", "lab_report", "veterinary", ...(can("identity.write") ? ["passport", "ownership", "identification", "cites"] : []), "other"] }, { name: "note", label: "Note" }],
  async (v) => { const fd = new FormData(); Object.entries(v).forEach(([k, x]) => fd.append(k, x ?? "")); await api(`/falcons/${f.id}/attachments`, { body: fd }); toast("Uploaded"); reload(); },
  { intro: `<div class="small muted">Passport, ownership and identification documents are restricted to roles with identity access.</div>` });
}
