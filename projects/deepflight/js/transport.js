// Transport between the console and the DeepFlight backend.
//
// server  (default): HTTP fetch + WebSocket to the FastAPI service (python -m uvicorn deepflight.api.app:app).
// browser          : the same Python backend runs in this tab - Pyodide (CPython on WebAssembly) in a Web Worker
//                    (engine/worker.js + deepflight/browser.py). Requests and the live stream go over postMessage.
// The mode comes from js/config.js (window.DF_CONFIG), which the site build rewrites.

const CFG = window.DF_CONFIG || { engine: "server" };
export const browserEngine = CFG.engine === "browser";
export const backUrl = CFG.back || "";

let worker = null;
let ready = null;
let nextId = 1;
const pending = new Map();
let streamCb = null;
const statusListeners = new Set();

export function onEngineStatus(cb) { statusListeners.add(cb); }

function bootWorker() {
  if (ready) return ready;
  ready = new Promise((resolve, reject) => {
    worker = new Worker(new URL("../engine/worker.js", import.meta.url));
    worker.onmessage = (ev) => {
      const m = ev.data;
      if (m.type === "status") statusListeners.forEach((cb) => cb(m.text));
      else if (m.type === "ready") resolve(m.info);
      else if (m.type === "res") {
        const p = pending.get(m.id);
        if (p) { pending.delete(m.id); p.resolve({ status: m.status, type: m.contentType || "", body: m.body }); }
      } else if (m.type === "stream") {
        if (streamCb) for (const msg of m.msgs) streamCb(msg);
      } else if (m.type === "error") {
        if (m.id != null && pending.has(m.id)) { pending.get(m.id).reject(new Error(m.text)); pending.delete(m.id); }
        else reject(new Error(m.text));
      }
    };
    worker.onerror = (e) => reject(new Error(e.message || "engine worker failed to start"));
    worker.postMessage({ type: "init" });
  });
  return ready;
}

/** HTTP-shaped request -> { status, type, body(text) } */
export async function request(path, { method = "GET", body } = {}) {
  if (!browserEngine) {
    const r = await fetch(path, { method, headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined });
    return { status: r.status, type: r.headers.get("content-type") || "", body: await r.text() };
  }
  await bootWorker();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ type: "req", id, method, path, body: body !== undefined ? JSON.stringify(body) : null });
  });
}

/** Live session stream (init / history / frames / status messages). Returns { close() }. */
export function openStream(sid, onMessage) {
  if (!browserEngine) {
    let closed = false;
    let ws = null;
    const open = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/ws/sessions/${sid}`);
      ws.onmessage = (m) => onMessage(JSON.parse(m.data));
      ws.onclose = () => { if (!closed) setTimeout(open, 1500); };
    };
    open();
    return { close() { closed = true; if (ws) { ws.onclose = null; ws.close(); } } };
  }
  streamCb = onMessage;
  bootWorker().then(() => worker.postMessage({ type: "subscribe", sid }));
  return { close() { if (streamCb === onMessage) { streamCb = null; worker && worker.postMessage({ type: "subscribe", sid: null }); } } };
}

/** Save an export (CSV / JSON) produced by the backend. */
export async function download(path, filename) {
  const r = await request(path);
  if (r.status >= 400) throw new Error(`${r.status} ${r.body}`);
  const blob = new Blob([r.body], { type: r.type.includes("json") ? "application/json" : "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
