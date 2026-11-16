/* AEROS OPS PRO browser edition: the Python backend (FastAPI + SQLAlchemy + SQLite + NumPy / pandas / SciPy) on
 * Pyodide (CPython compiled to WebAssembly) inside a Web Worker. The page sends HTTP-shaped requests via postMessage;
 * they run through the real ASGI application (validation, roles, approvals, audit trail, database) and the response
 * comes back. Nothing leaves the visitor's browser.
 *
 * in : {type:"init", base} | {type:"req", id, method, path, headers, body(ArrayBuffer|null)}
 * out: {type:"status", text} | {type:"ready", info} | {type:"res", id, status, headers, body} | {type:"error", id?, text}
 */
/* global loadPyodide */
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.29.0/full/";
importScripts(PYODIDE + "pyodide.js");

const PACKAGES = ["numpy", "pandas", "scipy", "sqlite3", "sqlalchemy", "pydantic", "fastapi", "starlette", "anyio", "sniffio", "typing-extensions",
  "python-dateutil", "pytz", "pillow", "fonttools", "hashlib"];
const DATA = "/home/pyodide/aerosdata";

let py = null;
let request = null;
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
    if (total) status(`${label} ${Math.round((100 * got) / total)}%`);
  }
  const out = new Uint8Array(got);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

async function init(base) {
  try {
    status("Loading the Python runtime (WebAssembly)…");
    py = await loadPyodide({ indexURL: PYODIDE });
    status("Loading NumPy, pandas, SciPy, SQLAlchemy, FastAPI… (cached after the first visit)");
    await py.loadPackage(PACKAGES);
    const [code, data] = await Promise.all([fetchBytes(base + "aeros.zip", "Backend code"), fetchBytes(base + "aeros-data.zip", "Demonstration data")]);
    py.unpackArchive(code, "zip");
    py.FS.mkdirTree(DATA);
    py.unpackArchive(data, "zip", { extractDir: DATA });
    status("Starting the AEROS OPS PRO backend…");
    const info = JSON.parse(await py.runPythonAsync(`
import os, json
os.environ.update({"AEROS_BROWSER": "1", "AEROS_DATA_DIR": "${DATA}", "AEROS_STATIC_DIR": "/nonexistent", "AEROS_PBKDF2_ITER": "2000", "MAVLINK20": "1"})
import aeros.browser as _b
json.dumps(_b.boot("${DATA}"), default=str)
`));
    request = py.globals.get("_b").request;
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
  if (m.type === "init") init(m.base);
  // one request at a time: the backend shares one SQLite database, like a single-worker server
  else if (m.type === "req") queue = queue.then(() => handle(m));
};
