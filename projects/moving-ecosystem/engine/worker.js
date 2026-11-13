/* In-browser simulation engine: the unchanged Python package `mpuav` on Pyodide (CPython compiled
 * to WebAssembly) inside a Web Worker, so the page stays responsive while the simulator runs.
 *
 * Messages in : {type:"init"} | {type:"start", scenario, params} | {type:"cmd", cmd} | {type:"stop"}
 * Messages out: {type:"status", text} | {type:"ready", scenarios, defaults} | {type:"frame", json, rt}
 *               {type:"reply", reply} | {type:"error", text}
 */
/* global loadPyodide */
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.29.0/full/";
importScripts(PYODIDE + "pyodide.js");

const TICK_MS = 50; // frame period (20 Hz), same as the server
let py = null;
let session = null;
let timer = null;
let scipyLoaded = false;
let lastWall = 0;
let lastSim = 0;

const post = (m) => self.postMessage(m);
const status = (text) => post({ type: "status", text });

async function init() {
  status("Loading Python runtime (WebAssembly)…");
  py = await loadPyodide({ indexURL: PYODIDE });
  status("Loading numpy…");
  await py.loadPackage("numpy");
  status("Loading the simulator…");
  const base = self.location.href.replace(/worker\.js.*$/, "");
  const buf = await (await fetch(base + "mpuav.zip", { cache: "no-cache" })).arrayBuffer();
  py.unpackArchive(buf, "zip");
  py.runPython(`
import json
from mpuav.live import LiveSession, scenario_list, default_params
`);
  const scenarios = JSON.parse(py.runPython("json.dumps(scenario_list())"));
  const defaults = JSON.parse(py.runPython("json.dumps(default_params())"));
  post({ type: "ready", scenarios, defaults });
}

async function start(scenario, params) {
  stopLoop();
  const needsScipy = ["lqr", "mpc"].includes(String(params.controller ?? "pid"));
  if (needsScipy && !scipyLoaded) {
    status("Loading scipy for the LQR / MPC controller (one-time, ~13 MB)…");
    await py.loadPackage("scipy");
    scipyLoaded = true;
  }
  status("Building scenario…");
  py.globals.set("_scn", scenario);
  py.globals.set("_params_json", JSON.stringify(params));
  py.runPython("session = LiveSession(int(_scn), json.loads(_params_json))");
  session = py.globals.get("session");
  lastWall = performance.now();
  lastSim = 0;
  status("");
  loop();
}

function loop() {
  timer = setTimeout(loop, TICK_MS);
  if (!session) return;
  try {
    if (!session.paused) {
      // ask for speed x TICK of simulated time, but never spend more than ~70% of the tick computing
      session.advance(session.speed * TICK_MS / 1000, (TICK_MS * 0.7) / 1000);
    }
    const json = session.frame_json();
    // effective real-time factor over the last second (WebAssembly can be slower than requested)
    const now = performance.now();
    const t = py.runPython("session.world.t");
    let rt = null;
    if (now - lastWall > 1000) {
      rt = (t - lastSim) / ((now - lastWall) / 1000);
      lastWall = now;
      lastSim = t;
    }
    post({ type: "frame", json, rt });
  } catch (e) {
    stopLoop();
    post({ type: "error", text: String(e) });
  }
}

function stopLoop() {
  if (timer) clearTimeout(timer);
  timer = null;
}

self.onmessage = async (ev) => {
  const m = ev.data;
  try {
    if (m.type === "init") await init();
    else if (m.type === "start") await start(m.scenario, m.params || {});
    else if (m.type === "stop") stopLoop();
    else if (m.type === "cmd" && session) {
      py.globals.set("_cmd_json", JSON.stringify(m.cmd));
      const r = py.runPython("json.dumps(session.command(json.loads(_cmd_json)))");
      const reply = JSON.parse(r);
      if (reply) post({ type: "reply", reply });
    }
  } catch (e) {
    post({ type: "error", text: String(e) });
  }
};
