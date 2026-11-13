// Flight analysis: 2D replay, 3D path, altitude / speed charts, metrics with provenance, baseline comparison.
import { S, $, $$, api, esc, can, guard, toast, dt, tm, dur, num, kmh, prov, provLegend, chart, makeMap, drawZones, dotIcon, metricValue } from "./core.js";

const PHASE_COLOR = { climb: "#58b8a6", level: "#d2a24c", descent: "#6aa5d8", stoop: "#e06a52", rest: "#8a8478" };
const LABEL = { duration_s: "Total flight duration", distance_m: "Distance travelled", max_speed_mps: "Maximum recorded speed", avg_speed_mps: "Average speed",
  max_altitude_m: "Maximum recorded altitude", avg_altitude_m: "Average altitude", max_height_m: "Max height above launch", climb_rate_mps: "Climbing rate (peak)",
  avg_climb_rate_mps: "Climbing rate (mean)", descent_rate_mps: "Descent rate (peak)", turn_total_deg: "Total turning", turn_rate_dps: "Turn rate (peak)",
  turn_right_share: "Clockwise share of turning", circles: "Net full rotations", peak_accel_g: "Peak acceleration", activity_index: "Activity index",
  peak_speed_gain_mps2: "Peak speed gain", rest_periods: "Rest periods", rest_time_s: "Rest time" };

function draw3d(canvas, s, getIdx) {
  // lightweight orbit view: x east, y north, z up (metres from launch)
  const lat0 = s.lat[0], lon0 = s.lon[0], k = 111320, kx = k * Math.cos(lat0 * Math.PI / 180);
  const P = s.t.map((_, i) => [(s.lon[i] - lon0) * kx, (s.lat[i] - lat0) * k, s.height[i] ?? 0]);
  const ext = Math.max(...P.map((p) => Math.hypot(p[0], p[1])), Math.max(...P.map((p) => p[2])), 50);
  let az = -0.7, el = 0.5, zoom = 1, drag = null;
  const ctx = canvas.getContext("2d");
  const render = () => {
    const w = canvas.width = canvas.clientWidth * devicePixelRatio, h = canvas.height = canvas.clientHeight * devicePixelRatio;
    const sc = Math.min(w, h) / (2.6 * ext) * zoom, ca = Math.cos(az), sa = Math.sin(az), ce = Math.cos(el), se = Math.sin(el);
    const pr = ([x, y, z]) => { const xr = x * ca - y * sa, yr = x * sa + y * ca; return [w / 2 + xr * sc, h * 0.62 - (z * ce - yr * se) * sc]; };
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = devicePixelRatio; ctx.strokeStyle = "#2c2a25";
    const g = Math.pow(10, Math.floor(Math.log10(ext))) / 2, n = Math.ceil(ext / g);
    for (let i = -n; i <= n; i++) { let a = pr([i * g, -n * g, 0]), b = pr([i * g, n * g, 0]); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
      a = pr([-n * g, i * g, 0]); b = pr([n * g, i * g, 0]); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); }
    ctx.strokeStyle = "#3d3a33";   // ground shadow + drop lines
    ctx.beginPath(); P.forEach((p, i) => { const q = pr([p[0], p[1], 0]); i ? ctx.lineTo(...q) : ctx.moveTo(...q); }); ctx.stroke();
    for (let i = 0; i < P.length; i += Math.max(1, Math.floor(P.length / 40))) { ctx.beginPath(); ctx.moveTo(...pr(P[i])); ctx.lineTo(...pr([P[i][0], P[i][1], 0])); ctx.stroke(); }
    ctx.lineWidth = 2.2 * devicePixelRatio;
    for (let i = 1; i < P.length; i++) { ctx.strokeStyle = PHASE_COLOR[s.phase[i]] || "#d2a24c"; ctx.beginPath(); ctx.moveTo(...pr(P[i - 1])); ctx.lineTo(...pr(P[i])); ctx.stroke(); }
    const c = pr(P[Math.min(getIdx(), P.length - 1)]);
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(c[0], c[1], 5 * devicePixelRatio, 0, 7); ctx.fill();
    ctx.fillStyle = "#a09a8c"; ctx.font = `${11 * devicePixelRatio}px sans-serif`;
    ctx.fillText(`grid ${g} m · drag to rotate · scroll to zoom · N ↑ at start`, 10 * devicePixelRatio, h - 10 * devicePixelRatio);
  };
  canvas.onpointerdown = (e) => { drag = [e.clientX, e.clientY, az, el]; canvas.setPointerCapture(e.pointerId); };
  canvas.onpointermove = (e) => { if (!drag) return; az = drag[2] + (e.clientX - drag[0]) * 0.01; el = Math.max(0.05, Math.min(1.5, drag[3] + (e.clientY - drag[1]) * 0.01)); render(); };
  canvas.onpointerup = () => { drag = null; };
  canvas.onwheel = (e) => { e.preventDefault(); zoom = Math.max(0.4, Math.min(8, zoom * (e.deltaY < 0 ? 1.15 : 0.87))); render(); };
  render();
  return render;
}

export async function flightView(main, [id]) {
  const f = await api(`/flights/${id}`);
  const s = f.series, n = s.t.length;
  const falcon = await api(`/falcons/${f.falcon_id}`);
  const ph = f.phases || {};
  main.innerHTML = `<div class="head"><div><div class="small"><a href="#/falcons">Falcons</a> / <a href="#/falcon/${falcon.id}/flights">${esc(falcon.name)}</a> /</div>
      <h1>Flight ${dt(f.start)}</h1><div class="muted">${esc(f.pattern.label)} ${prov("ai_interpretation")} · data quality ${((f.data_quality || 0) * 100).toFixed(0)}%${f.simulated ? ` · <span class="badge">simulated telemetry</span>` : ""}${f.source ? ` · <span class="badge">imported from file</span>` : ""}</div>
      ${f.source ? `<div class="small muted">Imported from ${esc(f.source.filename)} (${esc(f.source.format)}) · source: ${esc(f.source.label)} · uploaded by ${esc(f.source.uploaded_by)}${can("device.write") ? ` · <a href="#" id="delimp">delete this imported flight</a>` : ""}</div>` : ""}</div>${provLegend()}</div>
    ${f.source?.notes?.length ? `<div class="note"><b>How the file was read.</b> ${f.source.notes.map(esc).join(" ")}</div>` : ""}
    <div class="grid g2"><div><div id="map" class="map"></div></div><div><canvas class="c3d" id="c3d" style="height:460px"></canvas></div></div>
    <div class="card" style="margin-top:14px"><div class="row"><button id="play" class="primary" style="min-width:74px">Play</button>
      <select id="rate" style="width:auto"><option value="1">1×</option><option value="4" selected>4×</option><option value="10">10×</option><option value="30">30×</option></select>
      <input type="range" id="scrub" min="0" max="${n - 1}" value="0" class="grow"><span id="clock" class="nowrap small" style="min-width:300px"></span></div>
      <div class="row small" style="margin-top:8px">${Object.entries(PHASE_COLOR).map(([k, c]) => `<span><span class="dot" style="background:${c}"></span>${k} ${(100 * (ph[k] || 0)).toFixed(0)}%</span>`).join("")}
        <span class="muted">— ${esc(f.phase_note)} ${prov("estimated")}</span></div></div>
    <div class="grid g2" style="margin-top:14px"><div class="card"><h2>Altitude profile <span class="small muted">height above launch</span> ${prov("estimated")}</h2><div class="chartbox"><canvas id="ca"></canvas></div></div>
      <div class="card"><h2>Speed ${prov(f.metrics.max_speed_mps?.provenance)} &amp; vertical speed ${prov("derived")}</h2><div class="chartbox"><canvas id="cs"></canvas></div></div></div>
    <div class="grid g2" style="margin-top:14px"><div class="card"><h2>Flight metrics</h2><table><tr><th>Metric</th><th>Value</th><th>Source</th></tr>
        ${Object.entries(f.metrics).map(([k, m]) => `<tr title="${esc(m.note)}"><td>${esc(LABEL[k] || k)}<div class="small muted">${esc(m.note)}</div></td><td class="nowrap">${metricValue(k, m)}</td><td>${prov(m.provenance)}</td></tr>`).join("")}</table></div>
      <div><div class="card"><h2>Compared with ${esc(falcon.name)}'s own baseline ${prov("ai_interpretation")}</h2>
        ${f.baseline.available ? `<table><tr><th>Metric</th><th>This flight</th><th>Own typical range</th><th>Status</th></tr>${f.baseline.comparison.map((c) => `<tr><td>${esc(c.label)}</td><td>${c.value} ${esc(c.unit)}</td><td>${c.typical_low} – ${c.typical_high}</td>
          <td><span class="badge" style="color:${c.status === "typical" ? "var(--ok)" : c.status === "notable" ? "var(--warn)" : "var(--bad)"}">${c.status}${c.status !== "typical" ? ", " + c.direction : ""}</span></td></tr>`).join("")}</table>
          <div class="small muted">Baseline from ${f.baseline.flights_used} earlier flights (confidence ${((f.baseline.comparison[0]?.confidence || 0) * 100).toFixed(0)}%). ${esc(f.baseline.note)}</div>`
    : `<div class="muted">No individual baseline yet — needs ${f.baseline.min_flights} earlier flights (has ${f.baseline.flights_used}).</div>`}</div>
        <div class="card" style="margin-top:14px"><h2>Flight events</h2><div class="scroll" style="max-height:230px">${f.events.map((e) => `<div class="row small click" data-t="${e.t}"><a href="#" class="nowrap">${dur(e.t)}</a><span class="grow">${esc(e.label)}</span>${prov(e.provenance)}</div>`).join("")}</div></div>
        <div class="card" style="margin-top:14px"><h2>Data quality ${prov("derived")}</h2><dl class="kv"><dt>Usable fixes</dt><dd>${f.quality.usable_points} of ${f.quality.total_points}</dd><dt>Reporting interval</dt><dd>${f.quality.median_interval_s} s (median)</dd>
          <dt>Gaps</dt><dd>${f.quality.gaps}</dd><dt>Altitude source</dt><dd>${esc(f.quality.altitude_source || "none")}</dd><dt>Speed source</dt><dd>${esc(f.quality.speed_source)}</dd>
          <dt>Flagged fixes</dt><dd>${Object.entries(f.quality.flag_counts || {}).map(([k, v]) => `${esc(k.replace(/_/g, " "))}: ${v}`).join(" · ") || "none"}</dd></dl></div>
        ${f.session ? `<div class="card" style="margin-top:14px"><h2>Training session</h2><div>${esc(f.session.type)} · ${esc(f.session.trainer_name || "")} · <span class="badge">${esc(f.session.outcome || "—")}</span></div><div class="small muted">${esc(f.session.observations || "")}</div></div>` : ""}
        ${f.similar.length ? `<div class="card" style="margin-top:14px"><h2>Most similar earlier flights ${prov("ai_interpretation")}</h2>${f.similar.map((x) => `<a href="#/flight/${x.flight_id}" class="badge" style="margin-right:6px">flight ${x.flight_id} · ${(x.similarity * 100).toFixed(0)}%</a>`).join("")}<div class="small muted" style="margin-top:6px">Similarity of flight shape (phase mix, height, circling) for this bird only.</div></div>` : ""}</div></div>`;

  if ($("#delimp")) $("#delimp").onclick = guard(async (e) => { e.preventDefault();
    if (!confirm("Delete this imported flight and its positions? This cannot be undone.")) return;
    await api(`/flights/${id}`, { method: "DELETE" }); toast("Imported flight deleted"); location.hash = `#/falcon/${falcon.id}/flights`; });
  // map: phase-coloured path
  const map = makeMap($("#map"), [s.lat[0], s.lon[0]], 15);
  drawZones(map, S.meta.zones);
  for (let i = 1; i < n; i++) L.polyline([[s.lat[i - 1], s.lon[i - 1]], [s.lat[i], s.lon[i]]], { color: PHASE_COLOR[s.phase[i]] || "#d2a24c", weight: 3 }).addTo(map);
  map.fitBounds(L.latLngBounds(s.lat.map((la, i) => [la, s.lon[i]])).pad(0.15));
  const EV = { launch: "#5fb37a", recovery: "#6aa5d8", max_altitude: "#fff", max_speed: "#e0a53a", stoop: "#e06a52", rest: "#8a8478" };
  f.events.forEach((e) => L.circleMarker([e.lat, e.lon], { radius: 5, color: EV[e.kind] || "#999", weight: 2, fillOpacity: 0.9 }).bindTooltip(esc(e.label)).addTo(map));
  const marker = L.marker([s.lat[0], s.lon[0]], { icon: dotIcon("#fff") }).addTo(map);

  let idx = 0, playing = false, last = 0, acc = 0;
  const render3d = draw3d($("#c3d"), s, () => idx);
  const cursor = { id: "cursor", afterDraw(c) { const x = c.scales.x.getPixelForValue(idx); const { top, bottom } = c.chartArea; c.ctx.save(); c.ctx.strokeStyle = "#fff"; c.ctx.globalAlpha = .6; c.ctx.beginPath(); c.ctx.moveTo(x, top); c.ctx.lineTo(x, bottom); c.ctx.stroke(); c.ctx.restore(); } };
  const labels = s.t.map((t) => dur(t));
  const base = { pointRadius: 0, borderWidth: 1.6, tension: 0.15 };
  const ca = chart($("#ca"), { type: "line", plugins: [cursor], data: { labels, datasets: [{ ...base, label: "Height above launch (m)", data: s.height, borderColor: "#58b8a6", fill: true, backgroundColor: "rgba(88,184,166,.12)" }] } });
  const cs = chart($("#cs"), { type: "line", plugins: [cursor], data: { labels, datasets: [{ ...base, label: "Ground speed (m/s)", data: s.speed, borderColor: "#d2a24c" }, { ...base, label: "Vertical speed (m/s)", data: s.vs, borderColor: "#6aa5d8", yAxisID: "y2" }] },
    options: { scales: { y2: { position: "right", ticks: { color: "#a09a8c" }, grid: { display: false } } } } });
  const t0 = new Date(f.start).getTime();
  const show = () => {
    marker.setLatLng([s.lat[idx], s.lon[idx]]);
    $("#scrub").value = idx;
    $("#clock").innerHTML = `${tm(new Date(t0 + s.t[idx] * 1000))} · +${dur(s.t[idx])} · ${num(s.height[idx], 0)} m · ${kmh(s.speed[idx])} · <span style="color:${PHASE_COLOR[s.phase[idx]]}">${s.phase[idx]}</span>`;
    render3d(); ca.draw(); cs.draw();
  };
  const tick = (now) => {
    if (!playing) return;
    acc += (now - last) / 1000 * +$("#rate").value; last = now;
    while (idx < n - 1 && s.t[idx + 1] - s.t[idx] <= acc) { acc -= s.t[idx + 1] - s.t[idx]; idx++; }
    show();
    if (idx >= n - 1) { playing = false; $("#play").textContent = "Replay"; return; }
    if (document.body.contains($("#scrub"))) requestAnimationFrame(tick);
  };
  $("#play").onclick = () => { playing = !playing; if (playing) { if (idx >= n - 1) idx = 0; last = performance.now(); acc = 0; requestAnimationFrame(tick); } $("#play").textContent = playing ? "Pause" : "Play"; };
  $("#scrub").oninput = (e) => { idx = +e.target.value; show(); };
  $$("[data-t]", main).forEach((r) => r.onclick = (e) => { e.preventDefault(); const t = +r.dataset.t; idx = s.t.findIndex((x) => x >= t); if (idx < 0) idx = n - 1; show(); });
  show();
}
