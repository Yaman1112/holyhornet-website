/* In-browser simulation engine: runs the Python perch_uav package under Pyodide (WebAssembly).
 * Messages to the page are JSON strings using the same protocol as the FastAPI WebSocket.
 * The page terminates this worker to stop a run (Python runs synchronously inside it). */
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
importScripts(PYODIDE + "pyodide.js");

let ready = null;
const status = (text) => postMessage(JSON.stringify({ type: "status", text }));

async function init(base) {
  status("Loading Python runtime (first visit ≈ 10 MB, then cached)…");
  const py = await loadPyodide({ indexURL: PYODIDE });
  status("Loading NumPy…");
  await py.loadPackage("numpy");
  status("Loading the perching simulation engine…");
  const r = await fetch(base + "/py/perch_uav.zip");
  if (!r.ok) throw new Error("engine bundle not found (" + r.status + ")");
  py.unpackArchive(await r.arrayBuffer(), "zip");
  py.runPython("import json\nimport perch_uav.webapi as W");
  status("ready");
  return py;
}

onmessage = async (e) => {
  const { cmd, base, req } = e.data;
  try {
    if (!ready) ready = init(base);
    const py = await ready;
    if (cmd === "catalog") {
      postMessage(JSON.stringify({ type: "catalog", data: JSON.parse(py.runPython("json.dumps(W.catalog())")) }));
    } else if (cmd === "run") {
      py.globals.set("req_json", JSON.stringify(req));
      py.globals.set("post", (s) => postMessage(s));
      py.runPython("W.run(json.loads(req_json), post)");
    }
  } catch (err) {
    const msg = String((err && err.message) || err).split("\n").slice(-3).join(" ");
    postMessage(JSON.stringify({ type: "error", error: msg }));
    postMessage(JSON.stringify({ type: "end", status: "error" }));
  }
};
