/* HolyHornet Counter-UAS Intelligence — browser edition.
 * The Python engine (hhcuas: simulation, detection, tracking, fusion, evaluation) runs on Pyodide
 * (CPython compiled to WebAssembly) inside this Web Worker. The page sends HTTP-shaped requests by
 * postMessage; hhcuas.browser answers them with the same engine calls the FastAPI server makes.
 * Nothing is sent to any server.
 *
 * in : {type:"init"} | {type:"req", id, method, path, body} | {type:"live_open", sid, params} | {type:"live_stop", sid}
 * out: {type:"status", text} | {type:"ready", info} | {type:"res", id, status, ctype, body, filename} | {type:"error", id?, text}
 *      | {type:"progress", job, p} | {type:"live", sid, data} | {type:"live_end", sid}
 */
/* global loadPyodide */
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.29.0/full/";
importScripts(PYODIDE + "pyodide.js");

let py = null;
let bridge = null;
let queue = Promise.resolve();
let liveSid = null;
const post = (m, transfer) => self.postMessage(m, transfer || []);
const status = (text) => post({ type: "status", text });
const errText = (e) => String(e && e.message ? e.message : e);

async function init() {
  try {
    status("Loading the Python runtime (WebAssembly)…");
    py = await loadPyodide({ indexURL: PYODIDE });
    status("Loading NumPy, SciPy, OpenCV and pydantic…");
    await py.loadPackage(["numpy", "scipy", "opencv-python", "pydantic", "sqlite3"]);
    status("Loading the Counter-UAS engine, detector models and stored campaign results…");
    const base = self.location.href.replace(/worker\.js.*$/, "");
    const zip = await fetch(base + "cuas.zip", { cache: "no-cache" }).then((r) => {
      if (!r.ok) throw new Error("engine package not found (" + r.status + ")");
      return r.arrayBuffer();
    });
    py.unpackArchive(zip, "zip", { extractDir: "/home/pyodide" });
    status("Starting the engine…");
    const info = JSON.parse(await py.runPythonAsync(`
import os, sys, json
os.environ["CUAS_DATA_DIR"] = "/home/pyodide/cuas_data"
sys.path.insert(0, "/home/pyodide")
import hhcuas.browser as _b
json.dumps(_b.boot())
`));
    bridge = py.globals.get("_b");
    post({ type: "ready", info });
  } catch (e) {
    post({ type: "error", text: errText(e) });
  }
}

const progress = (job, p) => post({ type: "progress", job, p });

function handle(m) {
  try {
    const res = bridge.request(m.method, m.path, m.body == null ? undefined : m.body, progress);
    const out = res.toJs();
    res.destroy();
    let body = out[2];
    if (body && typeof body !== "string") body = new Uint8Array(body);   // copy out of the WebAssembly heap
    post({ type: "res", id: m.id, status: out[0], ctype: out[1], body, filename: out[3] || null });
  } catch (e) {
    post({ type: "error", id: m.id, text: errText(e) });
  }
}

function liveStep(sid) {
  if (liveSid !== sid) return;
  try {
    const msg = bridge.live_step();
    if (msg == null) { liveSid = null; post({ type: "live_end", sid }); return; }
    post({ type: "live", sid, data: msg });
    // yield to the event loop so stop messages and other requests get in between frames
    setTimeout(() => { queue = queue.then(() => liveStep(sid)); }, 0);
  } catch (e) {
    liveSid = null;
    post({ type: "live", sid, data: JSON.stringify({ type: "error", error: errText(e) }) });
    post({ type: "live_end", sid });
  }
}

self.onmessage = (ev) => {
  const m = ev.data;
  if (m.type === "init") init();
  else if (m.type === "req") queue = queue.then(() => handle(m));
  else if (m.type === "live_open") queue = queue.then(() => {
    try {
      const start = bridge.live_open(JSON.stringify(m.params));
      post({ type: "live", sid: m.sid, data: start });
      if (JSON.parse(start).type === "error") { post({ type: "live_end", sid: m.sid }); return; }
      liveSid = m.sid;
      liveStep(m.sid);
    } catch (e) {
      post({ type: "live", sid: m.sid, data: JSON.stringify({ type: "error", error: errText(e) }) });
      post({ type: "live_end", sid: m.sid });
    }
  });
  else if (m.type === "live_stop") queue = queue.then(() => {
    if (liveSid === m.sid) { liveSid = null; bridge.live_close(); post({ type: "live_end", sid: m.sid }); }
  });
};
