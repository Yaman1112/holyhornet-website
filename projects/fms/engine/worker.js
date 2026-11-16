/* HH-FMS browser edition: the unmodified Python backend (FastAPI + SQLAlchemy + SQLite + pandas + scikit-learn)
 * on Pyodide (CPython compiled to WebAssembly) inside a Web Worker. The page sends HTTP-shaped requests via
 * postMessage; they run through the real ASGI app (validation, auth, RBAC, audit, database) and the response
 * comes back. Nothing leaves the visitor's browser.
 *
 * in : {type:"init", base, secret} | {type:"req", id, method, path, headers, body(ArrayBuffer|null)} | {type:"tick"}
 * out: {type:"status", text} | {type:"ready", info} | {type:"res", id, status, headers, body} | {type:"error", id?, text}
 */
/* global loadPyodide */
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.29.0/full/";
importScripts(PYODIDE + "pyodide.js");

const PACKAGES = ["numpy", "pandas", "scipy", "scikit-learn", "joblib", "threadpoolctl", "sqlite3", "sqlalchemy",
  "pydantic", "fastapi", "starlette", "anyio", "sniffio", "typing-extensions", "python-dateutil", "pytz",
  "pillow", "fonttools", "hashlib"];
const DB_PATH = "/home/pyodide/fmsdata/fms.db";

let py = null;
let request = null;
let tick = null;
let queue = Promise.resolve();
const post = (m, t) => self.postMessage(m, t || []);
const status = (text) => post({ type: "status", text });

async function fetchBytes(url, label) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${label}: HTTP ${r.status}`);
  const total = Number(r.headers.get("content-length")) || 0;
  const reader = r.body.getReader();
  const parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    if (total) status(`${label} ${Math.round((100 * got) / total)}% of ${(total / 1048576).toFixed(1)} MB`);
  }
  const out = new Uint8Array(got);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

async function gunzipIfNeeded(bytes) {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function init(base, secret) {
  try {
    status("Loading the Python runtime (WebAssembly)…");
    py = await loadPyodide({ indexURL: PYODIDE });
    status("Loading pandas, scikit-learn, SQLAlchemy, FastAPI… (cached after the first visit)");
    await py.loadPackage(PACKAGES);
    const [code, db] = await Promise.all([
      fetchBytes(base + "fms.zip", "Backend code"),
      fetchBytes(base + "fms.db.gz", "Demo operations database").then(gunzipIfNeeded),
    ]);
    py.unpackArchive(code, "zip");
    py.FS.mkdirTree("/home/pyodide/fmsdata");
    py.FS.writeFile(DB_PATH, db);
    status("Starting the HH-FMS backend and bringing the operation up to the current time…");
    py.globals.set("_db_path", DB_PATH);
    py.globals.set("_secret", secret);
    const info = JSON.parse(await py.runPythonAsync(`
import json, hhfms.browser as _b
json.dumps(_b.boot(_db_path, _secret), default=str)
`));
    const b = py.globals.get("_b");
    request = b.request;
    tick = b.tick;
    post({ type: "ready", info });
  } catch (e) {
    post({ type: "error", text: String(e && e.message ? e.message : e) });
  }
}

async function handle(m) {
  try {
    const body = m.body ? py.toPy(new Uint8Array(m.body)) : null;
    const res = await request(m.method, m.path, JSON.stringify(m.headers || {}), body);
    const out = res.toJs({ dict_converter: Object.fromEntries });
    res.destroy();
    if (body) body.destroy();
    const bytes = out.body instanceof Uint8Array ? out.body : new Uint8Array(out.body);
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    post({ type: "res", id: m.id, status: out.status, headers: out.headers, body: ab }, [ab]);
  } catch (e) {
    post({ type: "error", id: m.id, text: String(e && e.message ? e.message : e) });
  }
}

self.onmessage = (ev) => {
  const m = ev.data;
  if (m.type === "init") init(m.base, m.secret);
  // one request at a time: the backend shares one SQLite database, like a single-worker server
  else if (m.type === "req") queue = queue.then(() => handle(m));
  else if (m.type === "tick" && tick) queue = queue.then(() => { try { tick(); } catch (e) { /* next tick retries */ } });
};
