/* HolyHornet Flapper browser edition: the Python engine and its FastAPI backend (numpy, SciPy, pydantic) on
 * Pyodide (CPython compiled to WebAssembly) inside a Web Worker. The page sends HTTP-shaped requests by
 * postMessage; they run through the real ASGI app and the response comes back. Job progress and the live
 * digital-twin link (a WebSocket on the server) are pushed back the same way.
 *
 * in : {type:"init"} | {type:"req", id, method, path, headers, body} | {type:"ws_open"|"ws_send"|"ws_close", sid, data?}
 * out: {type:"status", text} | {type:"ready", info} | {type:"res", id, status, headers, body} | {type:"error", id?, text}
 *      | {type:"progress", job, p} | {type:"ws", sid, event:"open"|"message"|"close", data?}
 */
/* global loadPyodide */
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.29.0/full/";
importScripts(PYODIDE + "pyodide.js");

let py = null;
let bridge = null;
let queue = Promise.resolve();
const post = (m) => self.postMessage(m);
const status = (text) => post({ type: "status", text });

async function init() {
  try {
    status("Loading the Python runtime (WebAssembly)…");
    py = await loadPyodide({ indexURL: PYODIDE });
    status("Loading numpy, SciPy, pydantic and FastAPI…");
    await py.loadPackage(["numpy", "scipy", "pydantic", "fastapi", "starlette", "anyio", "sniffio", "typing-extensions"]);
    status("Loading the Flapper engine, baseline and precomputed trims…");
    const base = self.location.href.replace(/worker\.js.*$/, "");
    const [zip, pre] = await Promise.all([
      fetch(base + "flapper.zip", { cache: "no-cache" }).then((r) => r.arrayBuffer()),
      fetch(base + "precomputed.json", { cache: "no-cache" }).then((r) => r.text()),
    ]);
    py.unpackArchive(zip, "zip", { extractDir: "/home/pyodide" });
    py.FS.writeFile("/home/pyodide/precomputed.json", pre);
    status("Starting the Flapper API…");
    const info = JSON.parse(await py.runPythonAsync(`
import sys, json
sys.path.insert(0, "/home/pyodide")
import hhflapper.browser as _b
json.dumps(_b.boot("/home/pyodide/flapper_data", "/home/pyodide/flapper_docs", "/home/pyodide/precomputed.json"))
`));
    bridge = py.globals.get("_b");
    post({ type: "ready", info });
  } catch (e) {
    post({ type: "error", text: String(e && e.message ? e.message : e) });
  }
}

async function handle(m) {
  try {
    const body = m.body != null ? py.toPy(new TextEncoder().encode(m.body)) : undefined;
    const res = await bridge.request(m.method, m.path, JSON.stringify(m.headers || {}), body);
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
  // one request at a time, like a single-worker server sharing one file store
  else if (m.type === "req") queue = queue.then(() => handle(m));
  else if (m.type === "ws_open") queue = queue.then(() => bridge.ws_open(m.sid, m.path || "/api/live"));
  else if (m.type === "ws_send") queue = queue.then(() => bridge.ws_send(m.sid, m.data));
  else if (m.type === "ws_close") queue = queue.then(() => bridge.ws_close(m.sid));
};
