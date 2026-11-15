/* HolyHornet DeepFlight AI - browser edition engine.
 * The Python backend (deepflight package: simulator, ESKF/VIO, integrity, place recognition, mapping, planner,
 * safety, assistant) on Pyodide (CPython compiled to WebAssembly) inside a Web Worker.
 * Requests run through deepflight.browser.request (same paths and responses as the HTTP API); a timer calls
 * deepflight.browser.tick, which advances running sessions and returns what the WebSocket would have streamed.
 *
 * in : {type:"init"} | {type:"req", id, method, path, body} | {type:"subscribe", sid}
 * out: {type:"status", text} | {type:"ready", info} | {type:"res", id, status, type, body} | {type:"stream", msgs}
 *      | {type:"error", id?, text}
 */
/* global loadPyodide */
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.29.0/full/";
importScripts(PYODIDE + "pyodide.js");

let py = null;
let api = null;
const post = (m) => self.postMessage(m);
const status = (text) => post({ type: "status", text });
const TICK_MS = 50;

async function init() {
  try {
    status("Loading the Python runtime (WebAssembly)…");
    py = await loadPyodide({ indexURL: PYODIDE });
    status("Loading numpy and SciPy…");
    await py.loadPackage(["numpy", "scipy"]);
    status("Loading the DeepFlight estimator, planner and simulator…");
    const base = self.location.href.replace(/worker\.js.*$/, "");
    const zip = await fetch(base + "deepflight.zip", { cache: "no-cache" }).then((r) => {
      if (!r.ok) throw new Error(`deepflight.zip: HTTP ${r.status}`);
      return r.arrayBuffer();
    });
    py.unpackArchive(zip, "zip", { extractDir: "/home/pyodide" });
    const info = JSON.parse(await py.runPythonAsync(`
import sys, json
sys.path.insert(0, "/home/pyodide")
import deepflight.browser as _df
json.dumps(_df.boot())
`));
    api = py.globals.get("_df");
    post({ type: "ready", info });
    let last = performance.now();
    setInterval(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      try {
        const msgs = JSON.parse(api.tick(dt, 0.035));
        if (msgs.length) post({ type: "stream", msgs });
      } catch (e) {
        post({ type: "error", text: String(e && e.message ? e.message : e) });
      }
    }, TICK_MS);
  } catch (e) {
    post({ type: "error", text: String(e && e.message ? e.message : e) });
  }
}

self.onmessage = (ev) => {
  const m = ev.data;
  if (m.type === "init") init();
  else if (m.type === "req") {
    try {
      const out = JSON.parse(api.request(m.method, m.path, m.body));
      post({ type: "res", id: m.id, status: out.status, contentType: out.type, body: out.body });
    } catch (e) {
      post({ type: "error", id: m.id, text: String(e && e.message ? e.message : e) });
    }
  } else if (m.type === "subscribe") {
    if (api) api.subscribe(m.sid);
  }
};
