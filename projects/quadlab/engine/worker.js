/* QuadLab Pro browser edition: the unmodified Python backend (FastAPI + SQLAlchemy + SQLite + NumPy) on Pyodide
 * (CPython compiled to WebAssembly) inside a Web Worker. The page sends HTTP-shaped requests via postMessage; they
 * run through the real ASGI app and the response comes back. Nothing leaves the visitor's browser.
 *
 * The data folder is kept in the browser's IndexedDB (Emscripten IDBFS), so projects survive a reload on the same
 * browser. If that storage is unavailable the engine still runs, in memory only, and says so.
 *
 * in : {type:"init", base} | {type:"req", id, method, path, headers, body(ArrayBuffer|null)} | {type:"reset"}
 * out: {type:"status", text} | {type:"ready", info} | {type:"res", id, status, headers, body} | {type:"error", id?, text}
 *      | {type:"reset-done"}
 */
/* global loadPyodide */
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.29.0/full/";
importScripts(PYODIDE + "pyodide.js");

const PACKAGES = ["numpy", "sqlite3", "sqlalchemy", "pydantic", "fastapi", "ssl"];
const DATA = "/home/pyodide/quadlab-data";
const DB_PATH = DATA + "/quadlab.db";

let py = null;
let request = null;
let persistent = false;
let queue = Promise.resolve();
const post = (m, t) => self.postMessage(m, t || []);
const status = (text) => post({ type: "status", text });

async function fetchBytes(url, label) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${label}: HTTP ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

async function gunzipIfNeeded(bytes) {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const syncfs = (populate) => new Promise((resolve, reject) => py.FS.syncfs(populate, (err) => (err ? reject(err) : resolve())));

async function persist() {
  if (!persistent) return;
  try { await syncfs(false); } catch (e) { /* storage full or revoked: keep running in memory */ }
}

function exists(path) {
  try { py.FS.stat(path); return true; } catch (e) { return false; }
}

function removeTree(dir) {
  for (const name of py.FS.readdir(dir)) {
    if (name === "." || name === "..") continue;
    const p = dir + "/" + name;
    if (py.FS.isDir(py.FS.stat(p).mode)) { removeTree(p); py.FS.rmdir(p); } else py.FS.unlink(p);
  }
}

async function init(base) {
  try {
    status("Loading the Python runtime (WebAssembly)…");
    py = await loadPyodide({ indexURL: PYODIDE });
    status("Loading NumPy, SQLAlchemy and FastAPI… (cached after the first visit)");
    await py.loadPackage(PACKAGES);
    status("Loading the QuadLab backend…");
    const code = await fetchBytes(base + "quadlab.zip", "Backend code");
    py.unpackArchive(code, "zip");
    py.FS.mkdirTree(DATA);
    try {
      py.FS.mount(py.FS.filesystems.IDBFS, {}, DATA);
      await syncfs(true);
      persistent = true;
    } catch (e) {
      persistent = false;
    }
    let fresh = false;
    if (!exists(DB_PATH)) {
      const db = await gunzipIfNeeded(await fetchBytes(base + "quadlab.db.gz", "Starter database"));
      py.FS.writeFile(DB_PATH, db);
      fresh = true;
    }
    status("Starting the QuadLab backend…");
    py.globals.set("_data_dir", DATA);
    const info = JSON.parse(await py.runPythonAsync(`
import json, quadlab.browser as _b
json.dumps(_b.boot(_data_dir), default=str)
`));
    request = py.globals.get("_b").request;
    await persist();
    post({ type: "ready", info: { ...info, persistent, fresh } });
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
    if (m.method !== "GET" && out.status < 400) await persist();
  } catch (e) {
    post({ type: "error", id: m.id, text: String(e && e.message ? e.message : e) });
  }
}

async function reset() {
  try {
    removeTree(DATA);
    await persist();
  } finally {
    post({ type: "reset-done" });
  }
}

self.onmessage = (ev) => {
  const m = ev.data;
  if (m.type === "init") init(m.base);
  // one request at a time: the backend shares one SQLite database, like a single-worker server
  else if (m.type === "req") queue = queue.then(() => handle(m));
  else if (m.type === "reset") queue = queue.then(reset);
};
