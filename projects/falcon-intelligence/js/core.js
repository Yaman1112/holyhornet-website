// Shared helpers: API client, escaping, formatting, modal forms, charts, maps.
import { engineFetch } from "./engine.js";
export const S = { token: localStorage.getItem("fi_token"), user: null, meta: null, timers: [], charts: [], closers: [] };

export function setTheme(t) { document.documentElement.dataset.theme = t; try { localStorage.setItem("fi_theme", t); } catch { /* private mode */ } }
setTheme(localStorage.getItem("fi_theme") || "dark");
export const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

export async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (S.token) headers.Authorization = "Bearer " + S.token;
  let body = opts.body;
  if (body && !(body instanceof FormData)) { headers["Content-Type"] = "application/json"; body = JSON.stringify(body); }
  const send = window.FI_ENGINE === "browser" ? engineFetch : fetch;
  const r = await send("/api" + path, { method: opts.method || (body ? "POST" : "GET"), headers, body });
  if (r.status === 401 && !path.startsWith("/auth")) { logout(); throw new Error("Please sign in again"); }
  if (!r.ok) {
    let msg = r.statusText;
    try { const j = await r.json(); msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail); } catch { /* not json */ }
    throw new Error(msg);
  }
  if (opts.raw) return r;
  const ct = r.headers.get("content-type") || "";
  return ct.includes("json") ? r.json() : r.text();
}

export function logout() {
  localStorage.removeItem("fi_token"); S.token = null; S.user = null;
  if (!location.hash.startsWith("#/login")) { sessionStorage.setItem("fi_next", location.hash); location.hash = "#/login"; }
}
export const can = (p) => !!S.user && S.user.permissions.includes(p);

export function toast(msg, err = false) {
  const d = document.createElement("div");
  if (err) d.className = "err";
  d.textContent = msg;
  $("#toast").append(d);
  setTimeout(() => d.remove(), err ? 7000 : 3500);
}
export const guard = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { toast(e.message, true); } };

// --- formatting ---------------------------------------------------------------------------------
export const dt = (s) => s ? new Date(s).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
export const day = (s) => s ? new Date(s).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";
export const tm = (s) => s ? new Date(s).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";
export function ago(sec) {
  if (sec == null) return "—";
  if (sec < 90) return Math.round(sec) + " s ago";
  if (sec < 5400) return Math.round(sec / 60) + " min ago";
  if (sec < 172800) return Math.round(sec / 3600) + " h ago";
  return Math.round(sec / 86400) + " days ago";
}
export const dur = (s) => s == null ? "—" : s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : s >= 60 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${Math.round(s)} s`;
export const dist = (m) => m == null ? "—" : m >= 1000 ? (m / 1000).toFixed(2) + " km" : Math.round(m) + " m";
export const kmh = (v) => v == null ? "—" : (v * 3.6).toFixed(0) + " km/h";
export const num = (v, d = 1) => v == null ? "—" : Number(v).toFixed(d);

export const PROV = { measured: "Measured", derived: "Derived", estimated: "Estimated", ai_interpretation: "AI interpretation", user_observation: "User observation", vet_assessment: "Vet assessment" };
export const PROV_HELP = { measured: "Reported directly by a sensor or device", derived: "Calculated mathematically from measured values", estimated: "Heuristic estimate with stated assumptions",
  ai_interpretation: "Algorithmic interpretation — an observation for human follow-up, never a diagnosis", user_observation: "Entered by an owner, falconer or breeder", vet_assessment: "Entered or confirmed by a veterinary professional" };
export const prov = (p) => p ? `<span class="prov ${esc(p)}" title="${esc(PROV_HELP[p] || "")}">${esc(PROV[p] || p)}</span>` : "";
export const provLegend = () => `<div class="legend">${Object.keys(PROV).map(prov).join("")}</div>`;
export const lvl = (n) => n ? `<span class="lvl lvl${n}" title="${esc(S.meta?.alert_levels?.[n] || "")}">${n}</span>` : `<span class="muted">—</span>`;
export const state = (s, label) => `<span class="state ${esc(s)}">${esc(label)}</span>`;
export function metricValue(key, m) {
  if (!m) return "—";
  const v = m.value;
  if (key.endsWith("_s")) return dur(v);
  if (key === "distance_m") return dist(v);
  if (m.unit === "m/s") return `${num(v)} m/s <span class="muted">(${kmh(v)})</span>`;
  if (m.unit === "ratio") return (v * 100).toFixed(0) + "%";
  return `${num(v, m.unit === "count" ? 0 : 1)} ${esc(m.unit)}`;
}

// --- lifecycle of timers / charts per view --------------------------------------------------------
export function cleanup() {
  S.timers.forEach(clearInterval); S.timers = [];
  S.charts.forEach((c) => { try { c.destroy(); } catch { /* gone */ } }); S.charts = [];
  S.closers.forEach((f) => { try { f(); } catch { /* gone */ } }); S.closers = [];
}
export const every = (ms, fn) => { const id = setInterval(guard(fn), ms); S.timers.push(id); return id; };

export function chart(canvas, cfg) {
  const GRID = cssVar("--line"), TICK = cssVar("--muted");
  const base = { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false },
    plugins: { legend: { labels: { color: TICK, boxWidth: 12 } } },
    scales: { x: { ticks: { color: TICK, maxTicksLimit: 9 }, grid: { color: GRID } }, y: { ticks: { color: TICK }, grid: { color: GRID } } } };
  const merged = { ...cfg, options: { ...base, ...(cfg.options || {}), plugins: { ...base.plugins, ...(cfg.options?.plugins || {}) },
    scales: { x: { ...base.scales.x, ...(cfg.options?.scales?.x || {}) }, y: { ...base.scales.y, ...(cfg.options?.scales?.y || {}) }, ...(Object.fromEntries(Object.entries(cfg.options?.scales || {}).filter(([k]) => k !== "x" && k !== "y"))) } } };
  const c = new Chart(canvas, merged);
  S.charts.push(c);
  return c;
}

export function makeMap(el, center = [24.805, 55.385], zoom = 13) {
  const map = L.map(el, { zoomControl: true, attributionControl: true }).setView(center, zoom);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map);
  setTimeout(() => map.invalidateSize(), 50);
  return map;
}
export const ZONE_COLOR = { training: "#d2a24c", home: "#5fb37a", notify_exit: "#e06a52", notify_enter: "#6aa5d8" };
export function drawZones(map, zones) {
  return zones.map((z) => L.circle([z.lat, z.lon], { radius: z.radius_m, color: ZONE_COLOR[z.kind] || "#999", weight: 1.5, fillOpacity: 0.04, dashArray: z.kind.startsWith("notify") ? "6 6" : null })
    .bindTooltip(`${z.name} — ${z.kind.replace("_", " ")}`).addTo(map));
}
export const dotIcon = (color, pulse = false) => L.divIcon({ className: "", iconSize: [16, 16], iconAnchor: [8, 8],
  html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 0 ${pulse ? 6 : 0}px ${color}55"></div>` });
export const STATE_COLOR = { live: "#5fb37a", recent: "#e0c040", no_fix: "#e0c040", stale: "#e06a52" };

// --- authenticated media ----------------------------------------------------------------------
const blobCache = new Map();
export async function blobUrl(attId) {
  if (blobCache.has(attId)) return blobCache.get(attId);
  const r = await api(`/attachments/${attId}/file`, { raw: true });
  const u = URL.createObjectURL(await r.blob());
  blobCache.set(attId, u);
  return u;
}
export function hydrateImages(root = document) {
  $$("img[data-att]", root).forEach((img) => blobUrl(img.dataset.att).then((u) => { img.src = u; }).catch(() => { img.alt = "unavailable"; }));
}
export async function openAuthed(path, name) {
  const r = await api(path, { raw: true });
  const blob = await r.blob();
  const u = URL.createObjectURL(blob);
  if (name) { const a = document.createElement("a"); a.href = u; a.download = name; a.click(); } else window.open(u, "_blank");
}

// --- modal form ---------------------------------------------------------------------------------
// fields: [{name,label,type,options,value,required,placeholder,help}]
export function formModal(title, fields, onSubmit, { intro = "", submit = "Save" } = {}) {
  const root = $("#modal-root");
  const f = (x) => {
    const req = x.required ? "required" : "", v = x.value ?? "";
    let input;
    if (x.type === "select") input = `<select name="${x.name}" ${req}>${x.options.map((o) => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${String(val) === String(v) ? "selected" : ""}>${esc(lab)}</option>`; }).join("")}</select>`;
    else if (x.type === "textarea") input = `<textarea name="${x.name}" rows="3" ${req} placeholder="${esc(x.placeholder || "")}">${esc(v)}</textarea>`;
    else if (x.type === "checkbox") return `<label class="row" style="color:var(--text)"><input type="checkbox" name="${x.name}" ${v ? "checked" : ""}> <span>${esc(x.label)}</span></label>`;
    else if (x.type === "file") input = `<input type="file" name="${x.name}" ${req} accept="${esc(x.accept || "")}">`;
    else input = `<input type="${x.type || "text"}" name="${x.name}" value="${esc(v)}" ${req} step="any" placeholder="${esc(x.placeholder || "")}">`;
    return `<label>${esc(x.label)}${x.required ? " *" : ""}</label>${input}${x.help ? `<div class="small muted">${esc(x.help)}</div>` : ""}`;
  };
  root.innerHTML = `<div class="back"><form class="box"><h2>${esc(title)}</h2>${intro}${fields.map(f).join("")}
    <div class="row" style="margin-top:16px;justify-content:flex-end"><button type="button" data-x>Cancel</button><button class="primary">${esc(submit)}</button></div></form></div>`;
  const close = () => { root.innerHTML = ""; };
  $("[data-x]", root).onclick = close;
  $(".back", root).onmousedown = (e) => { if (e.target.classList.contains("back")) close(); };
  $("form", root).onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target), out = {};
    for (const x of fields) {
      if (x.type === "checkbox") out[x.name] = fd.get(x.name) === "on";
      else if (x.type === "file") out[x.name] = fd.get(x.name);
      else if (x.type === "number") out[x.name] = fd.get(x.name) === "" ? null : Number(fd.get(x.name));
      else if (x.type === "datetime-local") out[x.name] = fd.get(x.name) ? new Date(fd.get(x.name)).toISOString() : null;
      else out[x.name] = fd.get(x.name);
    }
    const btn = $("button.primary", root);
    btn.disabled = true;
    try { await onSubmit(out); close(); } catch (err) { toast(err.message, true); btn.disabled = false; }
  };
}
export function infoModal(title, html) {
  const root = $("#modal-root");
  root.innerHTML = `<div class="back"><div class="box" style="width:min(760px,100%)"><h2>${esc(title)}</h2>${html}<div class="row" style="margin-top:16px;justify-content:flex-end"><button data-x>Close</button></div></div></div>`;
  $("[data-x]", root).onclick = () => { root.innerHTML = ""; };
  $(".back", root).onmousedown = (e) => { if (e.target.classList.contains("back")) root.innerHTML = ""; };
  return root;
}
export const nowLocal = () => { const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
