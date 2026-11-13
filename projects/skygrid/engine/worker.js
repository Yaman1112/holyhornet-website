/* SkyGrid browser engine: the unchanged Python package `skygrid.core` running on Pyodide (CPython compiled to
 * WebAssembly) in a Web Worker. Every command goes through Workspace.call — the same permission checks,
 * audit log and algorithms as the server edition. Nothing leaves the visitor's browser.
 *
 * In : {type:"init"} | {type:"call", id, cmd, args(json), actor(json)}
 * Out: {type:"status", text} | {type:"ready"} | {type:"fatal", text} | {type:"reply", id, ok, json|error, kind}
 *      {type:"frame", json}
 */
/* global loadPyodide */
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.29.0/full/";
importScripts(PYODIDE + "pyodide.js");

const TICK_MS = 200; // 5 Hz frames, like the server
let py = null;
let lastTick = 0;
let callFn = null;
let tickFn = null;

const post = (m) => self.postMessage(m);

async function init() {
  try {
    post({ type: "status", text: "Loading Python runtime (WebAssembly)…" });
    py = await loadPyodide({ indexURL: PYODIDE });
    post({ type: "status", text: "Loading numpy…" });
    await py.loadPackage("numpy");
    post({ type: "status", text: "Loading SkyGrid core…" });
    const base = self.location.href.replace(/worker\.js.*$/, "");
    const buf = await (await fetch(base + "skygrid.zip", { cache: "no-cache" })).arrayBuffer();
    py.unpackArchive(buf, "zip");
    py.runPython(`
import json, time
from skygrid.core.workspace import Workspace, CommandError
from skygrid.core.rbac import PermissionDenied
WS = Workspace("org-demo")

def _call(cmd, args, actor):
    try:
        out = WS.call(cmd, json.loads(args), json.loads(actor))
        return json.dumps({"ok": True, "result": out})
    except PermissionDenied as e:
        return json.dumps({"ok": False, "error": str(e), "kind": "denied"})
    except CommandError as e:
        return json.dumps({"ok": False, "error": str(e), "kind": "error"})
    except Exception as e:
        return json.dumps({"ok": False, "error": f"{type(e).__name__}: {e}", "kind": "error"})

def _tick(dt):
    s = WS.session
    if s is None:
        return ""
    running = s.sim.status == "running"
    if running:
        WS.tick(dt)
    return json.dumps(s.frame()) if running or s.sim.status != "running" else ""
`);
    callFn = py.globals.get("_call");
    tickFn = py.globals.get("_tick");
    post({ type: "status", text: "" });
    post({ type: "ready" });
    lastTick = performance.now();
    loop();
  } catch (e) {
    post({ type: "fatal", text: String(e && e.message ? e.message : e) });
  }
}

let lastIdleFrame = 0;
function loop() {
  setTimeout(loop, TICK_MS);
  const now = performance.now();
  const dt = (now - lastTick) / 1000;
  lastTick = now;
  try {
    const running = py.runPython("WS.session is not None and WS.session.sim.status == 'running'");
    if (running || now - lastIdleFrame > 1000) {
      const json = tickFn(dt);
      if (json) post({ type: "frame", json });
      if (!running) lastIdleFrame = now;
    }
  } catch (e) {
    post({ type: "status", text: "engine error: " + e });
  }
}

self.onmessage = (ev) => {
  const m = ev.data;
  if (m.type === "init") init();
  else if (m.type === "call") {
    const raw = callFn(m.cmd, m.args, m.actor);
    const r = JSON.parse(raw);
    if (r.ok) post({ type: "reply", id: m.id, ok: true, json: JSON.stringify(r.result) });
    else post({ type: "reply", id: m.id, ok: false, error: r.error, kind: r.kind });
    if (r.ok && /^(sim\.|proposals\.|missions\.execute|alerts\.)/.test(m.cmd)) {
      const json = tickFn(0);
      if (json) post({ type: "frame", json });
    }
  }
};
