/* In-browser engine: runs the uav_lab Python package in Pyodide (WebAssembly) inside a worker.
 * Messages in:  {id, op: "init"|"create"|"command"|"call", args}
 * Messages out: {id, result} | {id, error} | {type: "frame", frame} | {type: "status", text, progress}
 */
// Module worker: Pyodide >= 314 only runs in module workers.
import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.mjs";
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";

let py = null;
let B = null;
let running = false;
let speed = 1;
let looping = false;
const FRAME_DT = 0.1;

const status = (text, progress) => postMessage({ type: "status", text, progress });

async function init(base) {
  status("Starting Python in your browser…", 0.1);
  py = await loadPyodide({ indexURL: PYODIDE });
  status("Loading NumPy, SciPy and Pydantic…", 0.35);
  await py.loadPackage(["numpy", "scipy", "pydantic"]);
  status("Loading the UAV flight software…", 0.8);
  const buf = await (await fetch(base + "uav_lab.zip")).arrayBuffer();
  py.unpackArchive(buf, "zip", { extractDir: "/home/pyodide/lab" });
  py.runPython("import sys; sys.path.insert(0, '/home/pyodide/lab')");
  B = py.pyimport("uav_lab.browser");
  status("Ready", 1);
  return { ok: true, python: py.version };
}

function postFrame(json) {
  if (json && json !== "null") postMessage({ type: "frame", frame: json });
}

async function loop() {
  if (looping) return;
  looping = true;
  while (running) {
    const t0 = performance.now();
    postFrame(B.advance(FRAME_DT));
    if (!B.running()) running = false;
    const target = (FRAME_DT * 1000) / speed;
    const wait = Math.max(0, target - (performance.now() - t0));
    await new Promise((r) => setTimeout(r, wait));  // yields so commands can arrive
  }
  looping = false;
}

onmessage = async (ev) => {
  const { id, op, args } = ev.data;
  try {
    let result;
    if (op === "init") result = await init(args.base);
    else if (op === "create") {
      running = false;
      result = JSON.parse(B.create(JSON.stringify(args)));
      postFrame(B.frame());
      if (args.autostart) { running = true; loop(); }
    } else if (op === "command") {
      result = JSON.parse(B.command(JSON.stringify(args)));
      if (args.cmd === "start") { running = true; loop(); }
      else if (args.cmd === "pause") running = false;
      else if (args.cmd === "speed") speed = Math.max(0.1, Number(args.value) || 1);
      if (!running) postFrame(B.frame());
    } else if (op === "call") {
      result = JSON.parse(B.call(args.name, JSON.stringify(args.arg ?? null)));
    } else throw new Error("unknown op " + op);
    postMessage({ id, result });
  } catch (e) {
    postMessage({ id, error: String(e && e.message ? e.message : e) });
  }
};
