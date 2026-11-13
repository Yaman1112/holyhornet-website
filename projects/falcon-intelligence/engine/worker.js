/* Falcon Intelligence browser edition: the unmodified Python backend (FastAPI + SQLAlchemy + SQLite + numpy)
 * on Pyodide (CPython compiled to WebAssembly) inside a Web Worker. The page sends HTTP-shaped requests via
 * postMessage; they run through the real ASGI app and the response comes back.
 *
 * in : {type:"init", host, scheme, root} | {type:"req", id, method, path, headers, body(ArrayBuffer|null)}
 * out: {type:"status", text} | {type:"ready", info} | {type:"res", id, status, headers, body} | {type:"error", id?, text}
 */
/* global loadPyodide */
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.29.0/full/";
importScripts(PYODIDE + "pyodide.js");

let py = null;
let request = null;
let queue = Promise.resolve();
const post = (m, t) => self.postMessage(m, t || []);
const status = (text) => post({ type: "status", text });

async function init(m) {
  try {
    status("Loading the Python runtime (WebAssembly)…");
    py = await loadPyodide({ indexURL: PYODIDE });
    status("Loading numpy, SQLite, SQLAlchemy, FastAPI, Pillow…");
    await py.loadPackage(["numpy", "sqlite3", "sqlalchemy", "pydantic", "fastapi", "starlette", "anyio", "sniffio", "typing-extensions", "pillow"]);
    status("Loading the Falcon Intelligence backend…");
    const base = self.location.href.replace(/worker\.js.*$/, "");
    const buf = await (await fetch(base + "fi.zip", { cache: "no-cache" })).arrayBuffer();
    py.unpackArchive(buf, "zip");
    status("Creating the database and 30 days of synthetic records and flights…");
    py.globals.set("_boot_args", py.toPy([m.host || "falcon.local", m.scheme || "http", m.root || ""]));
    const info = JSON.parse(await py.runPythonAsync(`
import json, fi.browser as _b
json.dumps(_b.boot(*_boot_args))
`));
    request = py.globals.get("_b").request;
    post({ type: "ready", info });
  } catch (e) {
    post({ type: "error", text: String(e && e.message ? e.message : e) });
  }
}

async function handle(m) {
  try {
    const body = m.body ? py.toPy(new Uint8Array(m.body)) : undefined;
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
  if (m.type === "init") init(m);
  // one request at a time: the backend shares one SQLite database, exactly like a single-worker server
  else if (m.type === "req") queue = queue.then(() => handle(m));
};
