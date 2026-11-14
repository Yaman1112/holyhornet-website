/* HolyHornet SkyTherm browser edition: the Python backend (FastAPI + numpy + SciPy + SQLite) on Pyodide
 * (CPython compiled to WebAssembly) inside a Web Worker. The page sends HTTP-shaped requests via postMessage;
 * they run through the real ASGI app and the response comes back. Simulation runs push live frames
 * ({type:"live"}) while they execute, which stands in for the server's WebSocket.
 *
 * in : {type:"init"} | {type:"req", id, method, path, headers, body(string|null)}
 * out: {type:"status", text} | {type:"ready", info} | {type:"res", id, status, headers, body} | {type:"error", id?, text}
 *      | {type:"live", rid, progress?, frames?, done?}
 */
/* global loadPyodide */
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.29.0/full/";
importScripts(PYODIDE + "pyodide.js");

let py = null;
let request = null;
let queue = Promise.resolve();
const post = (m) => self.postMessage(m);
const status = (text) => post({ type: "status", text });

async function init() {
  try {
    status("Loading the Python runtime (WebAssembly)…");
    py = await loadPyodide({ indexURL: PYODIDE });
    status("Loading numpy, SciPy, pydantic, FastAPI, SQLite…");
    await py.loadPackage(["numpy", "scipy", "pydantic", "fastapi", "starlette", "anyio", "sniffio", "typing-extensions", "sqlite3"]);
    status("Loading the SkyTherm models and reference runs…");
    const base = self.location.href.replace(/worker\.js.*$/, "");
    const [zip, pre] = await Promise.all([
      fetch(base + "skytherm.zip", { cache: "no-cache" }).then((r) => r.arrayBuffer()),
      fetch(base + "precomputed.json", { cache: "no-cache" }).then((r) => r.text()),
    ]);
    py.unpackArchive(zip, "zip", { extractDir: "/home/pyodide" });
    py.FS.writeFile("/home/pyodide/precomputed.json", pre);
    status("Starting the SkyTherm API…");
    const info = JSON.parse(await py.runPythonAsync(`
import sys, json
sys.path.insert(0, "/home/pyodide")
import skytherm.browser as _b
json.dumps(_b.boot("/home/pyodide/skytherm_data", "/home/pyodide/precomputed.json"))
`));
    request = py.globals.get("_b").request;
    post({ type: "ready", info });
  } catch (e) {
    post({ type: "error", text: String(e && e.message ? e.message : e) });
  }
}

async function handle(m) {
  try {
    const body = m.body != null ? py.toPy(new TextEncoder().encode(m.body)) : undefined;
    const res = await request(m.method, m.path, JSON.stringify(m.headers || {}), body);
    const out = res.toJs({ dict_converter: Object.fromEntries });
    res.destroy();
    if (body) body.destroy();
    const bytes = out.body instanceof Uint8Array ? out.body : new Uint8Array(out.body);
    post({ type: "res", id: m.id, status: out.status, headers: out.headers, body: new TextDecoder().decode(bytes) });
  } catch (e) {
    post({ type: "error", id: m.id, text: String(e && e.message ? e.message : e) });
  }
}

self.onmessage = (ev) => {
  const m = ev.data;
  if (m.type === "init") init();
  // one request at a time, like a single-worker server sharing one SQLite store
  else if (m.type === "req") queue = queue.then(() => handle(m));
};
