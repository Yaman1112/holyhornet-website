// DeepFlight AI research console - session control, live stream, replay, views.
import { request, openStream, download, browserEngine, backUrl, onEngineStatus } from "./transport.js";
import { Twin } from "./twin.js";
import { lineChart, stateBar, polar } from "./charts.js";
import { drawTopdown } from "./topdown.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fx = (v, n = 2) => (v === null || v === undefined || Number.isNaN(v) ? "—" : Number(v).toFixed(n));

const NAV = [
  ["Operations", [["command", "Command Center"], ["nav", "Live Navigation"], ["mapping", "3D Mapping"]]],
  ["Estimation", [["loc", "Localization Intelligence"], ["fusion", "Sensor Fusion"], ["perception", "Environmental Perception"]]],
  ["Autonomy", [["planning", "Path Planning"], ["obstacles", "Obstacle Intelligence"], ["faults", "Fault Management"]]],
  ["Research", [["twin", "Digital Twin"], ["lab", "Simulation Lab"], ["experiments", "Research Experiments"], ["flightdata", "Flight Data"]]],
  ["System", [["hardware", "Hardware Integration"], ["settings", "Settings"]]],
];

const S = {
  sid: null, info: null, frames: [], events: [], live: true, cursor: -1, playing: false, replaySpeed: 1,
  voxLive: new Set(), voxReplay: new Set(), replayIdx: -1, liveBase: 0, status: null, scenarios: [],
  keyframes: [], view: "command", dirty: false, ws: null, faultCatalog: {},
  settings: { showTruthCharts: true, showTruthMap: false },
};
try { Object.assign(S.settings, JSON.parse(localStorage.getItem("df-settings") || "{}")); } catch { /* storage unavailable */ }
const twin = new Twin();

// ------------------------------------------------------------------ API helpers
async function api(path, opts = {}) {
  const r = await request(path, { method: opts.method || "GET", body: opts.body });
  if (r.status >= 400) {
    let detail = r.body;
    try { detail = JSON.parse(r.body).detail || r.body; } catch { /* plain text */ }
    throw new Error(`${r.status} ${detail}`);
  }
  return r.type.includes("json") ? JSON.parse(r.body) : r.body;
}
const control = (action, value) => S.sid && api(`/api/sessions/${S.sid}/control`, { method: "POST", body: { action, value } });
const command = (cmd) => S.sid && api(`/api/sessions/${S.sid}/command`, { method: "POST", body: cmd });

// ------------------------------------------------------------------ layout
function buildNav() {
  let n = 0;
  $("nav").innerHTML = NAV.map(([g, items]) => `<div class="group">${g}</div>` + items.map(([id, label]) =>
    `<a href="#${id}" data-view="${id}"><span class="num">${String(++n).padStart(2, "0")}</span>${label}</a>`).join("")).join("");
  $("nav").addEventListener("click", (e) => {
    const a = e.target.closest("a[data-view]");
    if (!a) return;
    e.preventDefault();
    showView(a.dataset.view);
  });
}

const VIEWS = {
  command: () => `
    <div class="grid g-cc">
      <div class="twin-host" id="host-command">${twinOverlay()}</div>
      <div class="grid" style="align-content:start">
        <div class="card"><h3>Localization <span class="r" id="cc-valid"></span></h3>
          <div class="big state" id="cc-state">—</div>
          <div class="kv" style="margin-top:6px">
            <span class="k">Position (map)</span><span class="v" id="cc-pos">—</span>
            <span class="k">σ horizontal / vertical</span><span class="v" id="cc-sig">—</span>
            <span class="k">Heading σ</span><span class="v" id="cc-yaw">—</span>
            <span class="k">Estimation source</span><span class="v" id="cc-src" title="">—</span>
            <span class="k">Map segment</span><span class="v" id="cc-seg">—</span>
          </div>
          <div class="note" id="cc-reasons"></div></div>
        <div class="card"><h3>Aircraft</h3><div class="kv">
            <span class="k">Mission mode</span><span class="v" id="cc-mode">—</span>
            <span class="k">Movement authority</span><span class="v" id="cc-beh">—</span>
            <span class="k">Navigation target</span><span class="v" id="cc-goal">—</span>
            <span class="k">Setpoint</span><span class="v" id="cc-sp">—</span>
            <span class="k">Battery</span><span class="v" id="cc-batt">—</span>
            <span class="k">Mapping</span><span class="v" id="cc-map">—</span>
            <span class="k">Nearest surface (proximity)</span><span class="v" id="cc-prox">—</span>
            <span class="k">GNSS</span><span class="v" style="color:#b9a6ff">denied (simulated)</span>
          </div></div>
        <div class="card"><h3>Sensor health</h3><table class="health" id="cc-health"></table></div>
      </div>
    </div>
    <div class="grid g2" style="margin-top:12px">
      <div class="card"><h3>Position uncertainty vs. true error <span class="r tag truth">truth = validation only</span></h3><canvas class="chart" id="cc-chart"></canvas></div>
      <div class="card"><h3>Event log <span class="r muted" id="cc-evcount"></span></h3><div class="events" id="cc-events"></div></div>
    </div>`,
  nav: () => `
    <div class="grid g-cc"><canvas class="topdown" id="nav-map"></canvas>
      <div class="grid" style="align-content:start">
        <div class="card"><h3>Navigation</h3><div class="kv" id="nav-kv"></div></div>
        <div class="card"><h3>Display</h3>
          <label><input type="checkbox" id="nav-truth"> show ground-truth trajectory &amp; geometry (validation)</label>
          <div class="note">Click the map to send the aircraft a new goal (operator command, logged).</div></div>
        <div class="card"><h3>Speed / authority</h3><canvas class="chart short" id="nav-speed"></canvas></div>
      </div></div>`,
  mapping: () => `
    <div class="grid g-cc"><div class="twin-host tall" id="host-mapping">${twinOverlay()}</div>
      <div class="grid" style="align-content:start">
        <div class="card"><h3>Map</h3><div class="kv" id="map-kv"></div>
          <div class="note">Occupancy voxels are integrated only while localization is RELIABLE or DEGRADED and the map segment is anchored - an uncertain pose never writes into the map.</div></div>
        <div class="card"><h3>Inspect</h3><div id="map-info" class="mono muted">Click a voxel to inspect it. Use “Measure” to measure distances between mapped points.</div></div>
        <div class="card"><h3>Map growth</h3><canvas class="chart short" id="map-chart"></canvas></div>
      </div></div>`,
  loc: () => `
    <div class="grid g4">
      <div class="card"><h3>State</h3><div class="big state" id="loc-state">—</div><div class="note" id="loc-time"></div></div>
      <div class="card"><h3>Horizontal σ</h3><div class="big" id="loc-sig">—</div><div class="note" id="loc-sigparts"></div></div>
      <div class="card"><h3>Visual tracking</h3><div class="big" id="loc-vio">—</div><div class="note" id="loc-vio2"></div></div>
      <div class="card"><h3>Recovery pipeline</h3><div id="loc-rec" class="note" style="margin-top:0"></div></div>
    </div>
    <div class="card" style="margin-top:12px"><h3>Integrity timeline</h3><div class="statebar" id="loc-bar"></div>
      <div class="note">Green RELIABLE · amber DEGRADED · orange UNCERTAIN · red LOST · blue RECOVERING. Transitions use measurable criteria (σ thresholds, aiding timeouts, tracking quality, sensor faults).</div></div>
    <div class="grid g2" style="margin-top:12px">
      <div class="card"><h3>Global σ vs. true error <span class="r tag truth">truth = validation</span></h3><canvas class="chart" id="loc-chart"></canvas></div>
      <div class="card"><h3>VIO inliers / detected features</h3><canvas class="chart" id="loc-inl"></canvas></div>
      <div class="card"><h3>Integrity transitions</h3><div class="events" id="loc-trans"></div></div>
      <div class="card"><h3>Place recognition &amp; loop closure</h3><div class="events" id="loc-place"></div></div>
    </div>`,
  fusion: () => `
    <div class="grid g2">
      <div class="card"><h3>Sensor health &amp; gating</h3><table class="tbl" id="fu-table"></table>
        <div class="note">NIS = normalised innovation squared per degree of freedom (EMA); ~1 is consistent. Rejected = chi-square gated measurements.</div></div>
      <div class="card"><h3>Aiding contributions (last 1 s)</h3><div id="fu-contrib"></div>
        <h3 style="margin-top:12px">Estimated IMU biases</h3><div class="kv" id="fu-bias"></div>
        <div class="note">Estimates sharing data are not fused as independent: VIO landmarks are initialised from the filter's own pose, so VIO does not constrain roll/pitch, and the reported global σ adds a drift bound and the map-anchor term VIO cannot reduce.</div></div>
    </div>
    <div class="card" style="margin-top:12px"><h3>Visual innovation consistency (NIS/dof)</h3><canvas class="chart" id="fu-nis"></canvas></div>`,
  perception: () => `
    <div class="grid g3">
      <div class="card"><h3>Feature front end</h3><div class="kv" id="pe-kv"></div></div>
      <div class="card"><h3>Depth sensing</h3><div class="kv" id="pe-depth"></div></div>
      <div class="card"><h3>Semantic perception</h3><div class="note" style="margin-top:0">Object detection / segmentation models (YOLO, SAM-class, monocular depth) are planned for Phase 4. Collision avoidance in DeepFlight never depends on classification: it uses depth and proximity geometry only.</div></div>
    </div>
    <div class="grid g2" style="margin-top:12px">
      <div class="card"><h3>Light level &amp; motion blur at the camera</h3><canvas class="chart" id="pe-light"></canvas></div>
      <div class="card"><h3>Image coverage of inliers (4×4 grid)</h3><canvas class="chart" id="pe-cov"></canvas></div>
    </div>`,
  planning: () => `
    <div class="grid g-cc"><canvas class="topdown" id="pl-map"></canvas>
      <div class="grid" style="align-content:start">
        <div class="card"><h3>Current plan</h3><div class="kv" id="pl-kv"></div>
          <div class="note">2.5-D A* on the voxel map slice at flight altitude; obstacles inflated by base margin + 2 × σ<sub>local</sub>; unknown space allowed at extra cost; shortcut smoothing; carrot follower with speed, acceleration and yaw-rate limits.</div></div>
        <div class="card"><h3>Replan log</h3><div class="events" id="pl-log"></div></div>
      </div></div>`,
  obstacles: () => `
    <div class="grid g3">
      <div class="card"><h3>Proximity ring (body frame)</h3><canvas class="polar" id="ob-polar"></canvas>
        <div class="note">8 ToF ranges + forward depth feed the reactive layer, which works without a valid position estimate.</div></div>
      <div class="card"><h3>Obstacle summary</h3><div class="kv" id="ob-kv"></div></div>
      <div class="card"><h3>Dynamic obstacles</h3><div id="ob-dyn" class="note" style="margin-top:0"></div></div>
    </div>`,
  faults: () => `
    <div class="grid g2">
      <div class="card"><h3>Active faults</h3><div id="fa-active"></div></div>
      <div class="card"><h3>Fault injection (simulation)</h3><div id="fa-inject" style="display:grid;grid-template-columns:1fr auto auto;gap:6px 8px;align-items:center"></div></div>
    </div>
    <div class="card" style="margin-top:12px"><h3>Fault catalogue - detection, threshold, severity, response, recovery</h3><div class="scroll"><table class="tbl" id="fa-cat"></table></div></div>`,
  twin: () => `<div class="twin-host tall" id="host-twin">${twinOverlay()}</div>`,
  lab: () => `
    <div class="grid g2">
      <div class="card"><h3>Scenarios</h3><div class="grid" id="lab-scen"></div></div>
      <div class="card"><h3>New session configuration</h3>
        <div class="kv" style="grid-template-columns:auto 1fr;gap:8px 12px;align-items:center">
          <span class="k">Scenario</span><span id="lab-sel" class="mono">M1</span>
          <span class="k">Seed</span><input type="number" id="lab-seed" value="7">
          <span class="k">Vehicle backend</span><select id="lab-backend"><option value="native">DeepFlight kinematic model (fast, deterministic)</option><option value="px4_sitl">PX4 SITL over MAVLink (real time; start SITL first)</option></select>
          <span class="k">Optical flow</span><label><input type="checkbox" id="lab-flow" checked> fitted</label>
          <span class="k">Rangefinder</span><label><input type="checkbox" id="lab-range" checked> fitted</label>
          <span class="k">Barometer</span><label><input type="checkbox" id="lab-baro" checked> fitted</label>
          <span class="k">Camera pixel noise</span><input type="number" id="lab-pix" value="0.8" step="0.1">
          <span class="k">Lost response</span><select id="lab-lost"><option value="hold_and_request_operator">hold + request operator</option><option value="land_in_place">land in place</option></select>
          <span class="k">Advanced overrides (JSON)</span><input type="text" id="lab-json" value="{}">
        </div>
        <div style="margin-top:10px;display:flex;gap:8px"><button class="btn primary" id="lab-create">Create session</button><span class="note" id="lab-msg"></span></div>
        <div class="note">All scenarios are deterministic for a given seed and configuration. Simulator: DeepFlight kinematic quadrotor + synthetic sensors (see docs for why Gazebo/PX4 SITL is not used in this build).</div>
      </div>
    </div>`,
  experiments: () => `
    <div class="grid g2">
      <div class="card"><h3>Run experiment</h3>
        <div class="kv" style="grid-template-columns:auto 1fr;gap:8px 12px;align-items:center">
          <span class="k">Scenario</span><select id="ex-scen"></select>
          <span class="k">Seeds</span><input type="text" id="ex-seeds" value="701,702,703">
          <span class="k">Label</span><input type="text" id="ex-label" value="baseline">
          <span class="k">Overrides (JSON)</span><input type="text" id="ex-json" value="{}">
        </div>
        <div style="margin-top:10px;display:flex;gap:8px;align-items:center"><button class="btn primary" id="ex-run">Run (≤ 6 seeds)</button><span class="note" id="ex-msg"></span></div>
        <div class="note">Each row records software version, config hash, overrides, dataset reference and validation status. Larger batches: <span class="mono">python -m deepflight.research.experiments</span>.</div></div>
      <div class="card"><h3>Current session metrics <button class="btn r" id="ex-metrics">Compute</button></h3><div class="kv" id="ex-cur"></div></div>
    </div>
    <div class="card" style="margin-top:12px"><h3>Results</h3><div class="scroll" id="ex-results"><div class="muted">No experiments run in this server session yet.</div></div></div>`,
  flightdata: () => `
    <div class="grid g2">
      <div class="card"><h3>Exports</h3>
        <p><a id="fd-csv" href="#" target="_blank">Trajectory CSV</a> - truth, estimate, σ, state per 0.1 s</p>
        <p><a id="fd-json" href="#" target="_blank">Session JSON</a> - configuration, events, place-recognition events, replans, metrics</p>
        <div class="note">Reproduce any run with the same scenario, seed and overrides (recorded in the export).</div></div>
      <div class="card"><h3>Filter</h3><select id="fd-filter"><option value="">all categories</option></select></div>
    </div>
    <div class="card" style="margin-top:12px"><h3>Event log</h3><div class="events tall" id="fd-events"></div></div>`,
  hardware: () => `
    <div class="grid g2">
      <div class="card"><h3>Operating mode</h3><div class="big" style="color:var(--cyan)">SIMULATION</div>
        <div class="note">Hardware mode is locked. Physical flight requires: validated autopilot interface (HIL), signed operator authorisation, geofence and kill-switch checks, and the safety case in docs/engineering/SAFETY.md. None of these are complete.</div>
        <button class="btn" disabled style="margin-top:10px">Enable hardware mode (locked)</button></div>
      <div class="card"><h3>Autopilot bridge preview (not transmitted)</h3><div id="hw-msgs" class="mono" style="font-size:11.5px;white-space:pre-wrap;max-height:300px;overflow:auto"></div></div>
    </div>
    <div class="card" style="margin-top:12px"><h3>Interfaces</h3><table class="tbl">
      <tr><th>Interface</th><th>Status</th><th>Notes</th></tr>
      <tr><td>MAVLink ODOMETRY / VISION_POSITION_ESTIMATE</td><td>implemented; used with PX4 SITL only</td><td>ENU/FLU → NED/FRD conversion at the boundary; covariance forwarded so EKF2 can gate it; quality field from integrity state</td></tr>
      <tr><td>SET_POSITION_TARGET_LOCAL_NED / SET_ATTITUDE_TARGET</td><td>implemented; used with PX4 SITL only</td><td>velocity + yaw setpoints only; autopilot keeps stabilisation, failsafes and geofence</td></tr>
      <tr><td>PX4 SITL (v1.15.4, WSL2)</td><td>bridge implemented: ODOMETRY + offboard velocity / attitude setpoints, ground-truth feedback</td><td>select “PX4 SITL” as vehicle backend in Simulation Lab; see docs/engineering/PX4_SITL.md. ArduPilot SITL not yet supported</td></tr>
      <tr><td>ROS 2 (Humble/Jazzy) nodes</td><td>planned</td><td>module boundaries mirror ROS 2 nodes: sensors → estimator → mapper → planner → supervisor</td></tr>
      <tr><td>Sensors (IMU, stereo, ToF ring, flow, LiDAR)</td><td>simulated</td><td>hardware drivers not selected - see docs/hardware/HARDWARE_ARCHITECTURE.md (budgets first)</td></tr>
    </table></div>`,
  settings: () => `
    <div class="grid g2"><div class="card"><h3>Display</h3>
      <p><label><input type="checkbox" id="set-truthcharts"> show true error on uncertainty charts (validation)</label></p>
      <p><label><input type="checkbox" id="set-truthmap"> show ground-truth trajectory on maps</label></p>
      <div class="note">Settings are stored in this browser only.</div></div>
      <div class="card"><h3>About</h3><div class="kv" id="set-about"></div></div></div>`,
};

function twinOverlay() {
  return `<div class="twin-tools">
      <button class="btn" data-layer="truth">Truth geometry</button><button class="btn" data-layer="voxels">Voxels</button>
      <button class="btn" data-layer="cloud">Depth cloud</button><button class="btn" data-layer="landmarks">Landmarks</button>
      <button class="btn" data-layer="ellipsoid">2σ ellipsoid</button><button class="btn" data-layer="frustum">Camera FOV</button>
      <button class="btn" data-layer="path">Route</button><button class="btn" data-layer="traj">Est. track</button>
      <button class="btn" data-layer="truthTraj">True track</button><button class="btn" data-layer="ghost">True pose</button>
      <button class="btn" data-layer="keyframes">Keyframes</button><button class="btn" data-layer="places">Place matches</button>
      <button class="btn" data-tool="measure">Measure</button><button class="btn" data-tool="goal">Set goal</button>
      <button class="btn" data-act="follow">Follow</button><button class="btn" data-act="fit">Fit</button></div>
    <div class="twin-legend"><span><i style="background:#38c8e0"></i>estimate (DeepFlight)</span>
      <span><i style="background:#ffffff;opacity:.6"></i>ground truth (simulation)</span><span><i style="background:#f0b23a"></i>planned route</span>
      <span><i style="background:#ff6b9a"></i>live depth returns</span><span><i style="background:#6ff1ff"></i>tracked landmarks</span>
      <span><i style="background:#b18cff"></i>keyframes</span></div>
    <div class="twin-hud"></div>`;
}

function showView(id) {
  S.view = id;
  document.querySelectorAll("nav.side a").forEach((a) => a.classList.toggle("active", a.dataset.view === id));
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${id}`));
  const host = document.querySelector(`#view-${id} .twin-host`);
  if (host) { twin.mount(host); syncLayerButtons(host); }
  if (location.hash !== `#${id}`) history.replaceState(null, "", `#${id}`);
  S.dirty = true;
  if (id === "faults") renderFaultStatic();
  if (id === "lab") renderLab();
  if (id === "experiments") renderExperimentsStatic();
}

function buildViews() {
  $("views").innerHTML = Object.entries(VIEWS).map(([id, fn]) => `<section class="view" id="view-${id}">${fn()}</section>`).join("");
  document.querySelectorAll(".twin-tools").forEach((tools) => tools.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.layer) { twin.layers[b.dataset.layer] = !twin.layers[b.dataset.layer]; S.dirty = true; }
    if (b.dataset.tool) {
      twin.tool = twin.tool === b.dataset.tool ? null : b.dataset.tool;
      twin.measurePts = [];
      setTwinInfo(twin.tool === "goal" ? "Click on the floor to set a navigation goal" : twin.tool === "measure" ? "Measure: select a mapped point" : "");
    }
    if (b.dataset.act === "follow") twin.follow = !twin.follow;
    if (b.dataset.act === "fit") twin.fitView();
    syncLayerButtons(tools.parentElement);
  }));
  twin.onInfo = (msg) => setTwinInfo(msg);
  twin.onGoal = async (xy) => {
    twin.tool = null;
    syncLayerButtons(twin.host);
    setTwinInfo(`Goal sent: (${xy[0].toFixed(1)}, ${xy[1].toFixed(1)})`);
    await command({ type: "set_goal", goal: xy });
  };
  $("nav-truth").checked = S.settings.showTruthMap;
  $("nav-truth").addEventListener("change", (e) => { S.settings.showTruthMap = e.target.checked; saveSettings(); S.dirty = true; });
  $("nav-map").addEventListener("click", (e) => {
    if (!S.td) return;
    const r = e.target.getBoundingClientRect();
    const x = (e.clientX - r.left - S.td.ox) / S.td.s + S.td.b0[0];
    const y = (S.td.h - (e.clientY - r.top) - S.td.oy) / S.td.s + S.td.b0[1];
    command({ type: "set_goal", goal: [x, y] });
  });
  $("set-truthcharts").checked = S.settings.showTruthCharts;
  $("set-truthmap").checked = S.settings.showTruthMap;
  $("set-truthcharts").addEventListener("change", (e) => { S.settings.showTruthCharts = e.target.checked; saveSettings(); S.dirty = true; });
  $("set-truthmap").addEventListener("change", (e) => { S.settings.showTruthMap = e.target.checked; $("nav-truth").checked = e.target.checked; saveSettings(); S.dirty = true; });
  $("fd-filter").addEventListener("change", () => (S.dirty = true));
}

function setTwinInfo(msg) {
  document.querySelectorAll(".twin-info").forEach((el) => el.remove());
  if (!msg || !twin.host) return;
  const d = document.createElement("div");
  d.className = "twin-info";
  d.textContent = msg;
  twin.host.appendChild(d);
  const mi = $("map-info");
  if (mi && S.view === "mapping") mi.textContent = msg;
}

function syncLayerButtons(host) {
  if (!host) return;
  host.querySelectorAll("[data-layer]").forEach((b) => b.classList.toggle("on", !!twin.layers[b.dataset.layer]));
  host.querySelectorAll("[data-tool]").forEach((b) => b.classList.toggle("on", twin.tool === b.dataset.tool));
  host.querySelectorAll("[data-act=follow]").forEach((b) => b.classList.toggle("on", twin.follow));
}

function saveSettings() { try { localStorage.setItem("df-settings", JSON.stringify(S.settings)); } catch { /* ignore */ } }

// ------------------------------------------------------------------ session + stream
async function init() {
  buildNav();
  buildViews();
  if (backUrl) {
    const a = document.createElement("a");
    a.className = "df-back";
    a.href = backUrl;
    a.textContent = "← HolyHornet simulations";
    document.querySelector(".brand > div").appendChild(a);
  }
  if (browserEngine) {
    const px4 = document.querySelector('#lab-backend option[value="px4_sitl"]');
    if (px4) { px4.disabled = true; px4.textContent = "PX4 SITL over MAVLink (full install only)"; }
  }
  if (browserEngine) {
    const views = document.getElementById("views");
    const loading = document.createElement("div");
    loading.className = "empty df-loading";
    loading.innerHTML = `<b>Starting DeepFlight in your browser</b><br><span id="df-boot">Loading…</span>
      <br><small class="muted">The full Python backend runs locally (WebAssembly); the first start downloads about 25 MB.</small>`;
    views.prepend(loading);
    onEngineStatus((t) => { const el = document.getElementById("df-boot"); if (el) el.textContent = t; });
    S.bootEl = loading;
  }
  S.scenarios = await api("/api/scenarios");
  if (S.bootEl) { S.bootEl.remove(); S.bootEl = null; }
  S.faultCatalog = await api("/api/faults");
  const opts = S.scenarios.map((s) => `<option value="${s.id}" ${s.implemented ? "" : "disabled"}>${esc(s.id)} · ${esc(s.name.replace(/^[A-Z0-9]+ - /, ""))}${s.implemented ? "" : " (planned)"}</option>`).join("");
  $("sel-scenario").innerHTML = opts;
  $("ex-scen").innerHTML = opts;
  const sessions = await api("/api/sessions");
  if (sessions.length) {
    const s = sessions.sort((a, b) => b.frames - a.frames)[0];
    connect(s.id);
  } else {
    await newSession("M1", 7, {});
  }
  bindControls();
  const h = (location.hash || "#command").slice(1);
  showView(h in VIEWS ? h : "command");
  requestAnimationFrame(tick);
  setInterval(() => { if (S.playing) stepReplay(); }, 100);
  setInterval(refreshKeyframes, 2000);
}

async function newSession(scenario, seed, overrides) {
  const s = await api("/api/sessions", { method: "POST", body: { scenario, seed: Number(seed), overrides } });
  connect(s.id);
  return s;
}

function connect(sid) {
  if (S.ws) S.ws.close();
  S.sid = sid;
  S.ws = openStream(sid, onMessage);
}

function onMessage(msg) {
  if (msg.type === "init") {
    S.info = msg.info;
    S.status = msg.status;
    S.frames = [];
    S.events = [];
    S.keyframes = [];
    S.liveBase = msg.frame_index;
    S.voxLive = new Set(msg.occupied);
    S.live = true; S.playing = false; S.cursor = -1;
    twin.setInfo(msg.info);
    twin.setVoxels(msg.occupied);
    $("sel-scenario").value = msg.status.scenario;
    $("inp-seed").value = msg.status.seed;
    S.dirty = true;
  } else if (msg.type === "history") {
    for (let i = 0; i < msg.frames.length; i++) {
      S.frames[msg.start + i] = msg.frames[i];
      S.events.push(...(msg.frames[i].events || []));
    }
    S.dirty = true;
  } else if (msg.type === "frames") {
    S.status = msg.status;
    for (const f of msg.frames) {
      S.frames.push(f);
      S.events.push(...(f.events || []));
      for (const a of f.map.added) S.voxLive.add(a);
      for (const r of f.map.removed) S.voxLive.delete(r);
      if (S.live) twin.applyVoxelDiff(f.map.added, f.map.removed);
    }
    S.dirty = true;
  } else if (msg.type === "status") {
    S.status = msg.status;
  }
}

async function refreshKeyframes() {
  if (!S.sid || S.view === "lab") return;
  const f = currentFrame();
  if (!f || f.keyframes === S.keyframes.length) return;
  try { S.keyframes = await api(`/api/sessions/${S.sid}/keyframes`); S.dirty = true; } catch { /* transient */ }
}

function bindControls() {
  $("btn-start").onclick = () => { goLive(); control("start"); };
  $("btn-pause").onclick = () => control("pause");
  $("btn-reset").onclick = () => control("reset");
  $("sel-speed").onchange = (e) => { const v = Number(e.target.value); control("speed", v); S.replaySpeed = v; };
  $("btn-new").onclick = () => newSession($("sel-scenario").value, $("inp-seed").value, {});
  $("btn-replay").onclick = () => {
    if (!S.frames.length) return;
    control("pause");
    S.live = false; S.playing = true;
    seek(0);
  };
  $("btn-live").onclick = () => goLive();
  $("rng-time").addEventListener("input", (e) => {
    S.live = false; S.playing = false;
    seek(Number(e.target.value));
  });
  $("op-banner").addEventListener("click", (e) => {
    const b = e.target.closest("[data-op]");
    if (b) command({ type: "operator_decision", choice: b.dataset.op });
  });
  $("btn-assist").onclick = () => $("assistant").classList.toggle("show");
  $("btn-assist-close").onclick = () => $("assistant").classList.remove("show");
  const sugg = ["Where is the aircraft localized?", "How confident is the position estimate?", "Which sensors are unreliable?",
    "Why did localization become degraded?", "What obstacles are present?", "Which route has the greatest clearance?",
    "Has the aircraft revisited a known location?", "Why did the navigation system replan?"];
  $("assist-sugg").innerHTML = sugg.map((q) => `<button class="btn" type="button">${q}</button>`).join("");
  $("assist-sugg").onclick = (e) => { const b = e.target.closest("button"); if (b) ask(b.textContent); };
  $("assist-form").onsubmit = (e) => { e.preventDefault(); const q = $("assist-q").value.trim(); if (q) ask(q); $("assist-q").value = ""; };
}

async function ask(q) {
  const log = $("assist-log");
  const div = document.createElement("div");
  div.innerHTML = `<div class="q">${esc(q)}</div><div class="a muted">…</div>`;
  log.appendChild(div);
  try {
    const r = await api(`/api/sessions/${S.sid}/assistant`, { method: "POST", body: { question: q } });
    div.querySelector(".a").classList.remove("muted");
    div.querySelector(".a").textContent = r.answer;
    if (r.evidence?.length) div.innerHTML += `<div class="evd">evidence @ t=${r.t}s<br>${r.evidence.map(esc).join("<br>")}</div>`;
  } catch (err) { div.querySelector(".a").textContent = `Error: ${err.message}`; }
  log.scrollTop = log.scrollHeight;
}

function goLive() {
  S.live = true; S.playing = false; S.cursor = -1;
  twin.setVoxels([...S.voxLive]);
  S.dirty = true;
}

function seek(idx) {
  idx = Math.max(0, Math.min(idx, S.frames.length - 1));
  if (idx < S.replayIdx || S.replayIdx < 0) { S.voxReplay = new Set(); S.replayIdx = -1; }
  for (let i = S.replayIdx + 1; i <= idx; i++) {
    const f = S.frames[i];
    if (!f) continue;
    for (const a of f.map.added) S.voxReplay.add(a);
    for (const r of f.map.removed) S.voxReplay.delete(r);
  }
  S.replayIdx = idx;
  S.cursor = idx;
  twin.setVoxels([...S.voxReplay]);
  S.dirty = true;
}

function stepReplay() {
  const n = Math.max(1, Math.round(S.replaySpeed));
  const next = S.cursor + n;
  if (next >= S.frames.length) { S.playing = false; return; }
  for (let i = S.cursor + 1; i <= next; i++) {
    const f = S.frames[i];
    if (!f) continue;
    for (const a of f.map.added) S.voxReplay.add(a);
    for (const r of f.map.removed) S.voxReplay.delete(r);
    twin.applyVoxelDiff(f.map.added, f.map.removed);
  }
  S.replayIdx = next;
  S.cursor = next;
  S.dirty = true;
}

function currentIndex() { return S.live ? S.frames.length - 1 : S.cursor; }
function currentFrame() { return S.frames[currentIndex()]; }

// ------------------------------------------------------------------ rendering
let lastHeavy = 0;
function tick(ts) {
  requestAnimationFrame(tick);
  if (!S.dirty) return;
  S.dirty = false;
  const idx = currentIndex();
  const f = S.frames[idx];
  $("rng-time").max = Math.max(S.frames.length - 1, 0);
  $("rng-time").value = S.live ? S.frames.length - 1 : idx;
  $("lbl-time").textContent = S.live ? "live" : `replay ${f ? f.t.toFixed(1) : 0} s${S.playing ? " ▶" : " ❚❚"}`;
  $("btn-live").classList.toggle("on", S.live);
  $("btn-start").textContent = S.status?.finished ? "Finished" : "Start";
  if (!f) { renderEmpty(); return; }
  renderTop(f);
  const stride = S.frames.length > 2500 ? 3 : 1;
  const hist = [];
  for (let i = 0; i <= idx; i += stride) if (S.frames[i]) hist.push(S.frames[i]);
  if (hist[hist.length - 1] !== f) hist.push(f);
  const places = (S.events.length, collectPlaces(idx));
  twin.update(f, hist.map((h) => h.est.p), hist.map((h) => h.truth.p), S.keyframes, places);
  const hud = twin.host?.querySelector(".twin-hud");
  if (hud) hud.innerHTML = `t ${f.t.toFixed(1)} s · <span class="st-${f.integrity.state}">${f.integrity.state}</span> · σ<sub>h</sub> ${fx(f.est.sigma_h)} m<br>est (${f.est.p.map((v) => v.toFixed(2)).join(", ")})<br><span class="dim">true error ${fx(f.truth.error_m)} m (sim)</span>`;
  const heavy = ts - lastHeavy > 250;
  if (heavy) lastHeavy = ts;
  const v = S.view;
  if (v === "command") renderCommand(f, hist, heavy);
  else if (v === "nav") renderNav(f, hist, heavy);
  else if (v === "mapping") renderMapping(f, hist, heavy);
  else if (v === "loc") renderLoc(f, hist, heavy);
  else if (v === "fusion") renderFusion(f, hist, heavy);
  else if (v === "perception") renderPerception(f, hist, heavy);
  else if (v === "planning") renderPlanning(f, hist, heavy);
  else if (v === "obstacles") renderObstacles(f);
  else if (v === "faults") renderFaults(f);
  else if (v === "experiments") renderExperimentsLive(f);
  else if (v === "flightdata") renderFlightData();
  else if (v === "hardware") renderHardware(f);
  else if (v === "settings") renderSettings();
  if (!S.live || !S.status?.running) { /* keep */ }
  if (S.status?.running && S.live) S.dirty = true;
}

function collectPlaces(idx) {
  const out = [];
  const seen = new Set();
  for (let i = 0; i <= idx; i++) {
    const p = S.frames[i]?.place;
    if (p && !seen.has(p.t + p.kind)) { seen.add(p.t + p.kind); out.push(p); }
  }
  return out;
}

function renderEmpty() {
  $("tb-state").textContent = "—";
  const h = $("cc-events");
  if (h) h.innerHTML = `<div class="muted">Session ready. Press <b>Start</b> to begin the scenario.</div>`;
}

function renderTop(f) {
  const st = f.integrity.state;
  const px4 = S.status?.backend === "px4_sitl";
  document.querySelector(".chip.sim").textContent = px4 ? "SIMULATION · PX4 SITL" : "SIMULATION";
  $("tb-state").textContent = st;
  $("tb-state").className = `state st-${st}`;
  $("tb-sigma").textContent = `${fx(f.est.sigma_h)} m`;
  $("tb-source").textContent = f.est.source;
  $("tb-mode").textContent = f.mode;
  $("tb-beh").textContent = f.behaviour;
  $("tb-batt").textContent = `${fx(f.battery.pct, 0)} %`;
  $("tb-t").textContent = `${f.t.toFixed(1)} s`;
  const showBanner = f.integrity.operator_required;
  $("op-banner").classList.toggle("show", showBanner && S.live);
}

function healthRows(h) {
  return Object.values(h).map((x) => `<tr><td><span class="dot d-${x.status}"></span>${esc(x.name)}</td><td class="mono">${x.status}</td><td class="muted" style="font-size:11px">${esc(x.reason)}</td></tr>`).join("");
}

function statesFrom(hist) {
  const out = [];
  for (const h of hist) if (!out.length || out[out.length - 1][1] !== h.integrity.state) out.push([h.t, h.integrity.state]);
  return out;
}

function evRows(list) {
  return list.map((e) => `<div class="ev ${e.severity}"><span class="t">${e.t.toFixed(1)}</span><span class="c">${esc(e.category)}</span><span class="m">${esc(e.message)}</span></div>`).join("");
}

function eventsUpTo(f) { return S.events.filter((e) => e.t <= f.t + 1e-6); }

function renderCommand(f, hist, heavy) {
  const e = f.est, st = f.integrity.state;
  $("cc-state").textContent = st;
  $("cc-state").className = `big state st-${st}`;
  $("cc-valid").innerHTML = e.valid ? `<span class="tag" style="color:var(--ok)">valid for navigation</span>` : `<span class="tag" style="color:var(--bad);border-color:var(--bad)">not valid for navigation</span>`;
  $("cc-pos").textContent = `${e.p.map((v) => v.toFixed(2)).join(", ")} m`;
  $("cc-sig").textContent = `${fx(e.sigma_h)} / ${fx(e.sigma_v)} m`;
  $("cc-yaw").textContent = `${fx(e.sigma_yaw_deg, 1)}°`;
  $("cc-src").textContent = e.source;
  $("cc-src").title = e.source;
  $("cc-seg").textContent = `#${f.integrity.segment} ${f.integrity.anchored ? "(anchored to global map)" : "(awaiting relocalization)"}`;
  $("cc-reasons").textContent = f.integrity.reasons.length ? `Criteria: ${f.integrity.reasons.join("; ")}` : "All integrity criteria nominal.";
  $("cc-mode").textContent = f.mode;
  $("cc-beh").textContent = `${f.behaviour} (speed ×${fx(f.setpoint.speed_scale, 1)})`;
  $("cc-goal").textContent = f.goal ? `#${f.goal_idx + 1}/${f.goals_total} (${f.goal[0].toFixed(1)}, ${f.goal[1].toFixed(1)})` : "none";
  $("cc-sp").textContent = `${f.setpoint.mode} v=(${f.setpoint.v.map((v) => v.toFixed(2)).join(", ")})`;
  $("cc-batt").textContent = `${fx(f.battery.pct, 1)} % · ${fx(f.battery.power_w, 0)} W`;
  $("cc-map").textContent = `${twin.voxList.length} occupied voxels · ${f.keyframes} keyframes`;
  $("cc-prox").textContent = `${fx(Math.min(...f.prox))} m`;
  $("cc-health").innerHTML = healthRows(f.health);
  if (heavy) {
    const evs = eventsUpTo(f);
    $("cc-events").innerHTML = evRows(evs.slice(-60).reverse());
    $("cc-evcount").textContent = `${evs.length} events`;
    uncertaintyChart($("cc-chart"), hist, f);
  }
}

function uncertaintyChart(canvas, hist, f) {
  const series = [{ label: "2σ global (estimator)", color: "#38c8e0", data: hist.map((h) => [h.t, 2 * h.est.sigma_h]) }];
  if (S.settings.showTruthCharts) series.push({ label: "true error (sim)", color: "#e8eef7", width: 1.1, data: hist.map((h) => [h.t, h.truth.error_m]) });
  lineChart(canvas, series, { ymin: 0, ymaxAuto: 1, states: statesFrom(hist), xmin: 0,
    hlines: [[0.5, "rgba(52,201,138,.6)", "2σ reliable"], [1.2, "rgba(240,138,58,.6)", "2σ uncertain"]] });
}

function renderNav(f, hist, heavy) {
  if (heavy) S.td = drawTopdown($("nav-map"), { info: S.info, voxSet: S.live ? S.voxLive : S.voxReplay, frame: f,
    trajEst: hist.map((h) => h.est.p), trajTruth: hist.map((h) => h.truth.p), showTruth: S.settings.showTruthMap, showTruthGeo: S.settings.showTruthMap });
  const p = f.plan || {};
  $("nav-kv").innerHTML = kv([["Mode", f.mode], ["Authority", f.behaviour], ["Goal", f.goal ? `(${f.goal.map((v) => v.toFixed(1)).join(", ")})` : "none"],
    ["Route length", p.length_m !== undefined ? `${p.length_m} m` : "—"], ["Clearance margin", p.inflation_m !== undefined ? `${p.inflation_m} m` : "—"],
    ["Last plan", p.reason ? `${p.reason} @ ${p.t}s` : "—"], ["Command", `${f.setpoint.mode} (${f.setpoint.v.map((v) => v.toFixed(2)).join(", ")})`],
    ["Speed scale", f.setpoint.speed_scale]]);
  if (heavy) lineChart($("nav-speed"), [
    { label: "|v cmd| m/s", color: "#f0b23a", data: hist.map((h) => [h.t, Math.hypot(h.setpoint.v[0], h.setpoint.v[1])]) },
    { label: "speed scale", color: "#38c8e0", data: hist.map((h) => [h.t, h.setpoint.speed_scale]) }], { ymin: 0, ymax: 1.4, states: statesFrom(hist), xmin: 0 });
}

const kv = (rows) => rows.map(([k, v]) => `<span class="k">${esc(k)}</span><span class="v" title="${esc(v)}">${esc(v)}</span>`).join("");

function renderMapping(f, hist, heavy) {
  const ms = S.frames.slice(0, currentIndex() + 1).reverse().find((x) => x.map.occupied_voxels !== undefined)?.map || {};
  $("map-kv").innerHTML = kv([["Occupied voxels (displayed)", twin.voxList.length], ["Voxel size", `${S.info.voxel.res} m`],
    ["Observed volume", ms.observed_volume_m3 !== undefined ? `${ms.observed_volume_m3} m³` : "—"],
    ["Depth scans integrated", ms.scans ?? "—"], ["Map conflict ratio", ms.conflict_ratio ?? "—"],
    ["Live depth returns", f.cloud.length], ["Insertion", f.integrity.state === "RELIABLE" || f.integrity.state === "DEGRADED" ? (f.integrity.anchored ? "active" : "paused (unanchored)") : "paused (integrity)"]]);
  if (heavy) {
    const pts = [];
    let n = 0;
    for (const h of hist) { n += h.map.added.length - h.map.removed.length; pts.push([h.t, n]); }
    lineChart($("map-chart"), [{ label: "net occupied voxels (from diffs)", color: "#38c8e0", data: pts }], { ymin: 0, xmin: 0, states: statesFrom(hist) });
  }
}

function renderLoc(f, hist, heavy) {
  const st = f.integrity.state;
  $("loc-state").textContent = st;
  $("loc-state").className = `big state st-${st}`;
  const trans = S.events.filter((e) => e.category === "integrity" && e.t <= f.t);
  const since = trans.length ? trans[trans.length - 1].t : 0;
  $("loc-time").textContent = `for ${(f.t - since).toFixed(1)} s · ${f.integrity.reasons.join("; ") || "criteria nominal"}`;
  $("loc-sig").textContent = `${fx(f.est.sigma_h)} m`;
  $("loc-sigparts").textContent = `vertical ${fx(f.est.sigma_v)} m · heading ${fx(f.est.sigma_yaw_deg, 1)}° · attitude ${fx(f.est.sigma_att_deg, 2)}° · velocity ${fx(f.est.sigma_vel)} m/s`;
  $("loc-vio").textContent = `${f.vio.status}`;
  $("loc-vio2").textContent = `${f.vio.inliers} inliers / ${f.vio.tracked} tracked / ${f.vio.detected} detected · reprojection ${fx(f.vio.reproj_rms_px, 1)} px`;
  const steps = [
    ["Detect degradation", ["DEGRADED", "UNCERTAIN", "LOST", "RECOVERING"].includes(st) || trans.length > 1],
    ["Hold safely (no RTH)", ["HOLD", "RECOVERY_SEARCH", "OPERATOR_WAIT"].includes(f.behaviour)],
    ["Re-detect features", f.vio.status === "OK" || f.vio.status === "WEAK"],
    ["Re-initialise VIO segment", f.integrity.segment > 0],
    ["Relocalize vs keyframes", f.stats.reloc_accepted > 0 && f.integrity.anchored],
    ["Resume mission", st === "RELIABLE" && f.behaviour === "NOMINAL" && f.integrity.segment > 0],
  ];
  $("loc-rec").innerHTML = steps.map(([n, ok]) => `<div><span class="dot ${ok ? "d-OK" : "d-DISABLED"}"></span>${n}</div>`).join("") +
    (f.integrity.operator_required ? `<div style="color:var(--bad);margin-top:4px">Operator intervention requested</div>` : "");
  if (heavy) {
    stateBar($("loc-bar"), statesFrom(hist), f.t);
    uncertaintyChart($("loc-chart"), hist, f);
    lineChart($("loc-inl"), [{ label: "inliers", color: "#34c98a", data: hist.map((h) => [h.t, h.vio.inliers]) },
      { label: "detected", color: "#5d6c84", data: hist.map((h) => [h.t, h.vio.detected]) }], { ymin: 0, xmin: 0, states: statesFrom(hist),
      hlines: [[25, "rgba(240,178,58,.6)", "weak"], [12, "rgba(239,80,80,.6)", "lost"]] });
    $("loc-trans").innerHTML = evRows(S.events.filter((e) => ["integrity", "localization", "relocalization"].includes(e.category) && e.t <= f.t).reverse());
    $("loc-place").innerHTML = evRows(S.events.filter((e) => ["loop_closure", "relocalization"].includes(e.category) && e.t <= f.t).reverse()) ||
      `<div class="muted">No place-recognition events yet (${f.keyframes} keyframes stored).</div>`;
  }
}

function renderFusion(f, hist, heavy) {
  $("fu-table").innerHTML = `<tr><th>Sensor</th><th>Status</th><th>Rate</th><th>Accepted</th><th>Rejected</th><th>NIS</th><th>Quality</th></tr>` +
    Object.values(f.health).map((h) => `<tr><td><span class="dot d-${h.status}"></span>${esc(h.name)}</td><td>${h.status}<div class="muted" style="font-size:10.5px">${esc(h.reason)}</div></td><td class="mono">${h.rate_hz} Hz</td><td class="mono">${h.accepted}</td><td class="mono">${h.rejected}</td><td class="mono">${h.nis ?? "—"}</td><td class="mono">${h.quality}</td></tr>`).join("");
  const c = f.contrib;
  const max = Math.max(...Object.values(c), 1);
  $("fu-contrib").innerHTML = Object.entries(c).map(([k, v]) => `<div style="display:grid;grid-template-columns:110px 1fr 40px;gap:8px;align-items:center;margin:3px 0"><span class="muted">${k}</span><div class="bar"><div style="width:${(100 * v) / max}%"></div></div><span class="mono">${v}</span></div>`).join("");
  $("fu-bias").innerHTML = kv([["accel bias (m/s²)", f.est.ba.join(", ")], ["gyro bias (rad/s)", f.est.bg.join(", ")]]);
  if (heavy) lineChart($("fu-nis"), [{ label: "camera NIS/dof", color: "#38c8e0", data: hist.map((h) => [h.t, h.health.camera.nis ?? 0]) },
    { label: "flow NIS/dof", color: "#f0b23a", data: hist.map((h) => [h.t, h.health.flow.nis ?? 0]) },
    { label: "rangefinder NIS/dof", color: "#b18cff", data: hist.map((h) => [h.t, h.health.rangefinder.nis ?? 0]) }], { ymin: 0, ymax: 5, xmin: 0, states: statesFrom(hist), hlines: [[1, "rgba(52,201,138,.6)", "consistent"]] });
}

function renderPerception(f, hist, heavy) {
  const q = f.vio;
  $("pe-kv").innerHTML = kv([["Status", q.status], ["Detected features", q.detected], ["With stereo depth", q.with_depth], ["Tracked (in local map)", q.tracked],
    ["Inliers (chi² gated)", q.inliers], ["Rejected", q.rejected], ["New landmarks this frame", q.initialized], ["Local map landmarks", f.landmarks.length],
    ["Reprojection RMS", `${fx(q.reproj_rms_px, 2)} px`], ["Mean light at camera", fx(q.mean_light, 2)], ["Motion blur", `${fx(q.blur_px, 1)} px`]]);
  $("pe-depth").innerHTML = kv([["Depth returns (subsampled)", f.cloud.length], ["Stereo range", `${S.info.camera.depth_range} m`],
    ["Camera FOV", `${S.info.camera.hfov_deg.toFixed(0)}° × ${S.info.camera.vfov_deg.toFixed(0)}°`], ["Active IR (works in the dark)", "yes (simulated)"],
    ["Proximity ring min", `${fx(Math.min(...f.prox))} m`]]);
  if (heavy) {
    lineChart($("pe-light"), [{ label: "light level", color: "#f0b23a", data: hist.map((h) => [h.t, h.vio.mean_light]) },
      { label: "blur px / 10", color: "#ff6b9a", data: hist.map((h) => [h.t, h.vio.blur_px / 10]) }], { ymin: 0, ymax: 1.1, xmin: 0, states: statesFrom(hist) });
    lineChart($("pe-cov"), [{ label: "coverage", color: "#38c8e0", data: hist.map((h) => [h.t, h.vio.coverage]) }], { ymin: 0, ymax: 1, xmin: 0, states: statesFrom(hist) });
  }
}

function renderPlanning(f, hist, heavy) {
  if (heavy) drawTopdown($("pl-map"), { info: S.info, voxSet: S.live ? S.voxLive : S.voxReplay, frame: f,
    trajEst: hist.map((h) => h.est.p), trajTruth: hist.map((h) => h.truth.p), showTruth: false, showTruthGeo: false });
  const p = f.plan || {};
  $("pl-kv").innerHTML = kv([["Result", p.ok === undefined ? "—" : p.ok ? "route found" : "no route"], ["Trigger", p.reason ?? "—"],
    ["Length", p.length_m !== undefined ? `${p.length_m} m` : "—"], ["Required clearance", p.inflation_m !== undefined ? `${p.inflation_m} m` : "—"],
    ["Min clearance on route", p.min_clearance_m !== undefined ? `${p.min_clearance_m} m` : "—"], ["A* expansions", p.expansions ?? "—"],
    ["Compute time", p.compute_ms !== undefined ? `${p.compute_ms} ms` : "—"], ["Failure reason", p.fail_reason || "—"]]);
  if (heavy) $("pl-log").innerHTML = evRows(S.events.filter((e) => e.category === "planning" && e.t <= f.t).reverse());
}

function renderObstacles(f) {
  polar($("ob-polar"), f.prox, S.info.config.planner.reactive_stop_m);
  const dirs = ["front", "front-left", "left", "rear-left", "rear", "rear-right", "right", "front-right"];
  const k = f.prox.indexOf(Math.min(...f.prox));
  $("ob-kv").innerHTML = kv([["Occupied voxels (static map)", twin.voxList.length], ["Closest surface", `${fx(f.prox[k])} m (${dirs[k]})`],
    ["Reactive stop distance", `${S.info.config.planner.reactive_stop_m} m`], ["Proximity fault active", f.faults.some((x) => x.id === "OBSTACLE_PROXIMITY") ? "yes" : "no"],
    ["Route clearance margin", f.plan?.inflation_m !== undefined ? `${f.plan.inflation_m} m` : "—"]]);
  $("ob-dyn").innerHTML = f.movers.length
    ? `${f.movers.length} moving obstacle(s) in this scenario (positions are simulation truth, shown for validation). DeepFlight handles them geometrically: depth returns mark voxels occupied, free-space carving clears them as people move, and the reactive layer brakes. Dedicated tracking (position/velocity/predicted occupancy) is Phase 4.`
    : "No moving obstacles in this scenario. Run scenario F to exercise dynamic obstacles. Multi-target tracking with velocity estimation and predicted occupancy is planned (Phase 4).";
}

function renderFaultStatic() {
  const cat = S.faultCatalog;
  $("fa-cat").innerHTML = `<tr><th>Fault</th><th>Detection</th><th>Threshold</th><th>Severity</th><th>Response</th><th>Notification</th><th>Recovery</th></tr>` +
    Object.entries(cat).map(([id, c]) => `<tr><td><b>${esc(c.name)}</b><div class="dim mono" style="font-size:10px">${id}</div></td><td>${esc(c.detection)}</td><td>${esc(c.threshold)}</td><td class="sev-${c.severity}">${c.severity}</td><td>${esc(c.response)}</td><td>${esc(c.notification)}</td><td>${esc(c.recovery)}</td></tr>`).join("");
  const inj = [["camera_fail", "Camera failure"], ["camera_freeze", "Camera freeze (stale timestamps)"], ["flow_fail", "Optical flow failure"],
    ["rangefinder_fail", "Rangefinder failure"], ["baro_fail", "Barometer failure"], ["imu_degraded", "IMU noise degradation"],
    ["imu_bias_jump", "Accelerometer bias step"], ["lights_off", "Corridor lighting off"], ["link_loss", "Telemetry link loss"]];
  $("fa-inject").innerHTML = inj.map(([id, n]) => `<span>${n}</span><button class="btn danger" data-inj="${id}">Inject</button>${id === "imu_bias_jump" ? "<span></span>" : `<button class="btn" data-clr="${id}">Clear</button>`}`).join("");
  $("fa-inject").onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.inj) command({ type: "inject_fault", fault: b.dataset.inj });
    if (b.dataset.clr) command({ type: "clear_fault", fault: b.dataset.clr });
  };
}

function renderFaults(f) {
  $("fa-active").innerHTML = f.faults.length ? `<table class="tbl"><tr><th>Fault</th><th>Since</th><th>Severity</th><th>Response</th></tr>` +
    f.faults.map((x) => `<tr><td>${esc(x.name)}</td><td class="mono">${x.since}s</td><td class="sev-${x.severity}">${x.severity}</td><td>${esc(x.response)}</td></tr>`).join("") + "</table>"
    : `<div class="muted">No active faults.</div>`;
}

function renderLab() {
  const sel = $("lab-sel").textContent;
  $("lab-scen").innerHTML = S.scenarios.map((s) => `<div class="scen ${s.implemented ? "" : "disabled"} ${s.id === sel ? "sel" : ""}" data-id="${s.id}" data-impl="${s.implemented}">
    <h4>${esc(s.name)} ${s.implemented ? "" : '<span class="tag">planned</span>'}</h4><p>${esc(s.description)}</p>${s.expected ? `<p class="dim" style="margin-top:4px">Expected: ${esc(s.expected)}</p>` : ""}</div>`).join("");
  $("lab-scen").onclick = (e) => {
    const c = e.target.closest(".scen");
    if (!c || c.dataset.impl !== "true") return;
    $("lab-sel").textContent = c.dataset.id;
    renderLab();
  };
  $("lab-create").onclick = async () => {
    let adv = {};
    try { adv = JSON.parse($("lab-json").value || "{}"); } catch { $("lab-msg").textContent = "Advanced overrides must be valid JSON"; return; }
    const ov = deepMerge({ sensors: { flow: { enabled: $("lab-flow").checked }, rangefinder: { enabled: $("lab-range").checked },
      baro: { enabled: $("lab-baro").checked }, camera: { pixel_noise: Number($("lab-pix").value) } }, safety: { lost_response: $("lab-lost").value } }, adv);
    try {
      $("lab-msg").textContent = $("lab-backend").value === "px4_sitl" ? "Connecting to PX4 SITL…" : "";
      const s = await api("/api/sessions", { method: "POST", body: { scenario: $("lab-sel").textContent, seed: Number($("lab-seed").value), overrides: ov, backend: $("lab-backend").value } });
      connect(s.id);
      $("lab-msg").textContent = `Session ${s.id} created - press Start.`;
      showView("command");
    } catch (err) { $("lab-msg").textContent = err.message; }
  };
}

function deepMerge(a, b) {
  for (const [k, v] of Object.entries(b)) a[k] = v && typeof v === "object" && !Array.isArray(v) ? deepMerge(a[k] || {}, v) : v;
  return a;
}

function renderExperimentsStatic() {
  $("ex-run").onclick = async () => {
    const seeds = $("ex-seeds").value.split(",").map((x) => parseInt(x, 10)).filter((x) => !Number.isNaN(x));
    let ov = {};
    try { ov = JSON.parse($("ex-json").value || "{}"); } catch { $("ex-msg").textContent = "Overrides must be JSON"; return; }
    $("ex-msg").textContent = `Running ${seeds.length} run(s)… (~10 s each)`;
    $("ex-run").disabled = true;
    try {
      await api("/api/experiments", { method: "POST", body: { scenario: $("ex-scen").value, seeds, overrides: ov, label: $("ex-label").value } });
      $("ex-msg").textContent = "Done.";
      await showExperiments();
    } catch (err) { $("ex-msg").textContent = err.message; }
    $("ex-run").disabled = false;
  };
  $("ex-metrics").onclick = async () => {
    const m = await api(`/api/sessions/${S.sid}/metrics`);
    $("ex-cur").innerHTML = kv(Object.entries(m).filter(([, v]) => typeof v !== "object").map(([k, v]) => [k, v]));
  };
  showExperiments();
}

async function showExperiments() {
  const list = await api("/api/experiments");
  if (!list.length) return;
  const cols = ["seed", "variant", "mission_complete", "collisions", "ate_rmse_m", "ate_rmse_aligned_m", "rpe_2m_rmse_m", "max_error_m",
    "nees_xy_mean_valid", "availability_reliable_or_degraded", "lost_events", "recoveries", "relocalizations_accepted", "loop_closures_accepted",
    "place_recognition_precision", "min_clearance_m", "map_precision", "replans", "compute_ms_per_cycle_mean", "energy_used_wh", "config_hash"];
  $("ex-results").innerHTML = list.slice().reverse().map((e) => `<h2 style="margin-top:8px">${esc(e.scenario)} · ${esc(e.label)} <span class="muted mono" style="font-size:11px">${e.id} · ${e.created}</span> <a href="/api/experiments/${e.id}.csv" target="_blank" style="font-size:12px">CSV</a></h2>
    <table class="tbl"><tr>${cols.map((c) => `<th>${c.replace(/_/g, " ")}</th>`).join("")}</tr>${e.rows.map((r) => `<tr>${cols.map((c) => `<td class="mono">${esc(r[c])}</td>`).join("")}</tr>`).join("")}</table>`).join("");
}

function renderExperimentsLive() { /* static view; metrics computed on demand */ }

function renderFlightData() {
  $("fd-csv").onclick = (e) => { e.preventDefault(); download(`/api/sessions/${S.sid}/export/trajectory.csv`, `deepflight_${S.sid}_trajectory.csv`).catch((err) => alert(err.message)); };
  $("fd-json").onclick = (e) => { e.preventDefault(); download(`/api/sessions/${S.sid}/export/session.json`, `deepflight_${S.sid}_session.json`).catch((err) => alert(err.message)); };
  const cats = [...new Set(S.events.map((e) => e.category))];
  const sel = $("fd-filter");
  if (sel.options.length - 1 !== cats.length) {
    const cur = sel.value;
    sel.innerHTML = `<option value="">all categories</option>` + cats.map((c) => `<option>${c}</option>`).join("");
    sel.value = cur;
  }
  const f = sel.value;
  $("fd-events").innerHTML = evRows(S.events.filter((e) => !f || e.category === f).slice().reverse());
}

let hwLast = 0;
async function renderHardware(f) {
  if (performance.now() - hwLast < 1000) return;
  hwLast = performance.now();
  try {
    const r = await api(`/api/sessions/${S.sid}/autopilot_preview`);
    $("hw-msgs").textContent = JSON.stringify(r, null, 2);
  } catch (err) { $("hw-msgs").textContent = err.message; }
}

function renderSettings() {
  $("set-about").innerHTML = kv([["Software", S.info?.software_version], ["Scenario", S.info?.scenario.id], ["Seed", S.info?.seed],
    ["Session", S.sid], ["Mode", browserEngine ? "SIMULATION · browser edition (Python on WebAssembly)" : "SIMULATION"], ["Renderer", "three.js 0.170"]]);
}

window.addEventListener("resize", () => { twin.resize(); S.dirty = true; });
// Debug / automated-verification hook (background tabs pause requestAnimationFrame).
window.deepflight = { state: S, twin, render: () => { S.dirty = true; tick(performance.now() + 1e6); twin.renderNow(); }, showView };
init().catch((err) => { document.getElementById("views").innerHTML = `<div class="empty">Could not reach the DeepFlight API: ${esc(err.message)}</div>`; });
