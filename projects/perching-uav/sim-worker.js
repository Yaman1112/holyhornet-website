/* In-browser simulation engine: the Python perch_uav package under Pyodide (WebAssembly).
 * Messages to the page are JSON strings using the same protocol as the FastAPI WebSocket.
 * The run is a perch_uav.webapi.Session advanced in short chunks, so the worker stays responsive to
 * pause / resume / step / speed / stop commands (no need to terminate and reload Python). */
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
importScripts(PYODIDE + "pyodide.js");

let ready = null;
let py = null;
let session = null;          // Python Session proxy
let paused = false;
let speed = 1;               // x real time; null = as fast as possible
let anchorWall = 0, anchorSim = 0, lastPerf = 0;
let timer = null;
const CHUNK = 0.1;           // simulated seconds per slice when running flat out
const STEP = 0.5;            // simulated seconds per single step

const send = (o) => postMessage(JSON.stringify(o));
const status = (text) => send({ type: "status", text });

async function init(base) {
  status("Loading Python runtime (first visit ≈ 10 MB, then cached)…");
  const p = await loadPyodide({ indexURL: PYODIDE });
  status("Loading NumPy…");
  await p.loadPackage("numpy");
  status("Loading the perching simulation engine…");
  const r = await fetch(base + "/py/perch_uav.zip");
  if (!r.ok) throw new Error("engine bundle not found (" + r.status + ")");
  p.unpackArchive(await r.arrayBuffer(), "zip");
  p.runPython("import json\nimport perch_uav.webapi as W");
  status("ready");
  return p;
}

function fail(err) {
  const msg = String((err && err.message) || err).split("\n").slice(-3).join(" ");
  send({ type: "error", error: msg });
  send({ type: "end", status: "error" });
  dispose();
}

function dispose() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (session) { try { session.destroy(); } catch (e) { /* already gone */ } }
  session = null;
}

function perf() {
  const p = session.perf().toJs({ dict_converter: Object.fromEntries });
  p.paused = paused;
  p.speed = speed;
  send(p);
}

function tick() {
  timer = null;
  if (!session || paused) return;
  try {
    const t = session.t;
    let target;
    if (speed === null) {
      target = t + CHUNK;
    } else {
      const now = performance.now() / 1000;
      target = anchorSim + (now - anchorWall) * speed;
      if (target - t > 1.0) { anchorWall = now; anchorSim = t; target = t + CHUNK; }   // cannot keep up: re-anchor
      target = Math.min(target, t + CHUNK);
    }
    const done = target > t ? session.advance(target) : false;
    const now = performance.now();
    if (now - lastPerf > 500) { lastPerf = now; perf(); }
    if (done) { perf(); dispose(); return; }
  } catch (err) { fail(err); return; }
  timer = setTimeout(tick, speed === null ? 0 : 15);
}

function reanchor() {
  anchorWall = performance.now() / 1000;
  anchorSim = session ? session.t : 0;
}

onmessage = async (e) => {
  const { cmd, base, req, value } = e.data;
  try {
    if (!ready) ready = init(base);
    py = await ready;
    if (cmd === "catalog") {
      send({ type: "catalog", data: JSON.parse(py.runPython("json.dumps(W.catalog())")) });
    } else if (cmd === "parameters") {
      send({ type: "parameters", data: JSON.parse(py.runPython("json.dumps(W.parameter_catalog())")) });
    } else if (cmd === "plan" || cmd === "metrics" || cmd === "summarize") {
      // study commands for the research-lab worker pool; the reply carries the caller's id
      py.globals.set("arg_json", JSON.stringify(e.data.arg));
      const fn = { plan: "ST.plan(a)", metrics: "ST.run_metrics(a)", summarize: "ST.summarize(a['spec'], a['rows'])" }[cmd];
      const out = py.runPython("import perch_uav.studies as ST\na = json.loads(arg_json)\njson.dumps(W.finite(" + fn + "), allow_nan=False)");
      send({ type: "reply", id: e.data.id, data: JSON.parse(out) });
    } else if (cmd === "run") {
      dispose();
      paused = !!(req && req.start_paused);
      speed = req && "speed" in req ? req.speed : 1;
      py.globals.set("req_json", JSON.stringify(req));
      py.globals.set("post", (s) => postMessage(s));
      session = py.runPython("W.Session(json.loads(req_json), post)");
      reanchor();
      perf();
      if (!paused) tick();
    } else if (!session) {
      return;
    } else if (cmd === "pause") {
      paused = true; perf();
    } else if (cmd === "resume") {
      paused = false; reanchor(); perf(); if (!timer) tick();
    } else if (cmd === "step") {
      paused = true;
      if (session.advance(session.t + STEP)) { perf(); dispose(); } else perf();
    } else if (cmd === "speed") {
      speed = value === undefined ? null : value; reanchor(); perf();
    } else if (cmd === "stop") {
      session.stop(); dispose();
    }
  } catch (err) {
    if (e.data && e.data.id !== undefined) {
      send({ type: "reply", id: e.data.id, error: String((err && err.message) || err).split("\n").slice(-3).join(" ") });
    } else {
      fail(err);
    }
  }
};
