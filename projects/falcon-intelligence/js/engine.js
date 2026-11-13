// Browser-edition transport: sends API calls to the Python backend running in a Web Worker instead of a server.
// `engineFetch` returns a real Response object, so the rest of the app cannot tell the difference.
let worker = null, seq = 0;
const pending = new Map();

export function startEngine(onStatus) {
  return new Promise((resolve, reject) => {
    worker = new Worker("engine/worker.js");
    worker.onerror = (e) => reject(new Error(e.message || "The in-browser engine failed to load"));
    worker.onmessage = (ev) => {
      const m = ev.data;
      if (m.type === "status") onStatus?.(m.text);
      else if (m.type === "ready") resolve(m.info);
      else if (m.type === "res") { const p = pending.get(m.id); pending.delete(m.id); p?.resolve(new Response(m.status === 204 || m.status === 304 ? null : m.body, { status: m.status, headers: m.headers })); }
      else if (m.type === "error") { if (m.id == null) reject(new Error(m.text)); else { const p = pending.get(m.id); pending.delete(m.id); p?.reject(new Error(m.text)); } }
    };
    const root = location.pathname.replace(/\/(index\.html)?$/, "");
    worker.postMessage({ type: "init", host: location.host, scheme: location.protocol.replace(":", ""), root });
  });
}

export async function engineFetch(path, { method = "GET", headers = {}, body } = {}) {
  let buf = null;
  const h = { ...headers };
  if (body instanceof FormData) {                 // let the browser build the multipart body and its boundary
    const r = new Response(body);
    h["Content-Type"] = r.headers.get("content-type");
    buf = await r.arrayBuffer();
  } else if (typeof body === "string") buf = new TextEncoder().encode(body).buffer;
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ type: "req", id, method, path, headers: h, body: buf }, buf ? [buf] : []);
  });
}
