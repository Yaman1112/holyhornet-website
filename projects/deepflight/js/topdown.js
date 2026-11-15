// Top-down navigation map: occupancy slice at flight altitude (from the occupied voxel set), inflation,
// planned route, estimated trajectory with 2-sigma ellipse, truth (validation, toggle), goal.
import { eigSym3 } from "./twin.js";

const SC = { RELIABLE: "#34c98a", DEGRADED: "#f0b23a", UNCERTAIN: "#f08a3a", LOST: "#ef5050", RECOVERING: "#5aa9ff" };

export function drawTopdown(canvas, ctxData) {
  const { info, voxSet, frame, trajEst, trajTruth, showTruth, showTruthGeo } = ctxData;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h || !info) return;
  if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#050a13";
  ctx.fillRect(0, 0, w, h);
  const b0 = info.world.bounds_min, b1 = info.world.bounds_max;
  const sx = (w - 20) / (b1[0] - b0[0]), sy = (h - 20) / (b1[1] - b0[1]);
  const s = Math.min(sx, sy);
  const ox = 10 + ((w - 20) - s * (b1[0] - b0[0])) / 2, oy = 10 + ((h - 20) - s * (b1[1] - b0[1])) / 2;
  const X = (x) => ox + (x - b0[0]) * s;
  const Y = (y) => h - (oy + (y - b0[1]) * s);
  // grid
  ctx.strokeStyle = "#0f1a2b";
  for (let x = Math.ceil(b0[0]); x <= b1[0]; x += 2) { ctx.beginPath(); ctx.moveTo(X(x), Y(b0[1])); ctx.lineTo(X(x), Y(b1[1])); ctx.stroke(); }
  for (let y = Math.ceil(b0[1]); y <= b1[1]; y += 2) { ctx.beginPath(); ctx.moveTo(X(b0[0]), Y(y)); ctx.lineTo(X(b1[0]), Y(y)); ctx.stroke(); }
  if (showTruthGeo) {
    ctx.strokeStyle = "rgba(160,180,210,.22)";
    for (const b of info.world.boxes) {
      if (b.kind === "floor" || b.kind === "ceiling" || b.min[2] > 2.0) continue;
      ctx.strokeRect(X(b.min[0]), Y(b.max[1]), (b.max[0] - b.min[0]) * s, (b.max[1] - b.min[1]) * s);
    }
  }
  // occupancy slice: voxels whose centre lies in the planning altitude band
  const vx = info.voxel;
  const [nx, ny, nz] = vx.shape;
  const res = vx.res;
  const alt = info.config.planner.flight_altitude_m, band = info.config.planner.altitude_band_m;
  const cells = new Set();
  for (const f of voxSet) {
    const k = f % nz;
    const z = vx.origin[2] + (k + 0.5) * res;
    if (z < alt - band || z > alt + band) continue;
    const j = Math.floor(f / nz) % ny, i = Math.floor(f / (ny * nz));
    cells.add(i * ny + j);
  }
  const infl = frame?.plan?.inflation_m || 0;
  if (infl > 0) {
    ctx.fillStyle = "rgba(240,178,58,.10)";
    const r = infl * s;
    for (const c of cells) {
      const i = Math.floor(c / ny), j = c % ny;
      const x = X(vx.origin[0] + (i + 0.5) * res), y = Y(vx.origin[1] + (j + 0.5) * res);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.fillStyle = "#c3d3ea";
  for (const c of cells) {
    const i = Math.floor(c / ny), j = c % ny;
    ctx.fillRect(X(vx.origin[0] + i * res), Y(vx.origin[1] + (j + 1) * res), res * s + 0.5, res * s + 0.5);
  }
  const line = (pts, color, width = 1.5, dash = []) => {
    if (!pts || pts.length < 2) return;
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash);
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])))); ctx.stroke();
    ctx.setLineDash([]); ctx.lineWidth = 1;
  };
  if (showTruth) line(trajTruth, "rgba(255,255,255,.55)", 1.2, [4, 3]);
  line(trajEst, "#38c8e0", 1.6);
  if (frame) {
    line(frame.path, "#f0b23a", 2);
    if (frame.goal) {
      ctx.strokeStyle = "#f0b23a"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(X(frame.goal[0]), Y(frame.goal[1]), 7, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1;
    }
    const e = frame.est;
    const C2 = [[e.cov[0][0], e.cov[0][1], 0], [e.cov[1][0], e.cov[1][1], 0], [0, 0, 1e-9]];
    const { vals, vecs } = eigSym3(C2);
    const idx = [0, 1, 2].sort((a, b) => vals[b] - vals[a]).slice(0, 2);
    const a = 2 * Math.sqrt(Math.max(vals[idx[0]], 0)), bb = 2 * Math.sqrt(Math.max(vals[idx[1]], 0));
    const ang = Math.atan2(vecs[idx[0]][1], vecs[idx[0]][0]);
    ctx.fillStyle = (SC[frame.integrity.state] || "#34c98a") + "33";
    ctx.strokeStyle = SC[frame.integrity.state] || "#34c98a";
    ctx.beginPath(); ctx.ellipse(X(e.p[0]), Y(e.p[1]), Math.max(a * s, 3), Math.max(bb * s, 3), -ang, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.save();
    ctx.translate(X(e.p[0]), Y(e.p[1])); ctx.rotate(-e.yaw);
    ctx.fillStyle = "#38c8e0"; ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, 5); ctx.lineTo(-6, -5); ctx.fill();
    ctx.restore();
    if (showTruth) {
      ctx.strokeStyle = "#fff"; ctx.beginPath(); ctx.arc(X(frame.truth.p[0]), Y(frame.truth.p[1]), 4, 0, Math.PI * 2); ctx.stroke();
    }
    for (const mv of frame.movers || []) {
      ctx.fillStyle = "rgba(240,138,58,.7)";
      ctx.fillRect(X(mv[0]), Y(mv[4]), (mv[3] - mv[0]) * s, (mv[4] - mv[1]) * s);
    }
  }
  ctx.fillStyle = "#8a9ab3"; ctx.font = "11px Inter, sans-serif";
  ctx.fillText(`occupancy slice ${(alt - band).toFixed(1)}–${(alt + band).toFixed(1)} m · amber halo = planning clearance ${infl.toFixed(2)} m`, 12, h - 10);
  return { X, Y, s, b0, h, ox, oy };
}
