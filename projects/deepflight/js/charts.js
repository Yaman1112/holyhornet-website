// Small dependency-free canvas charts (time series + state band + polar proximity).
const STATE_FILL = { RELIABLE: "#34c98a", DEGRADED: "#f0b23a", UNCERTAIN: "#f08a3a", LOST: "#ef5050", RECOVERING: "#5aa9ff" };

function prep(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return null;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

/**
 * series: [{label, color, data: [[t, v], ...], dash?}], opts: {ymin, ymax, ylabel, states: [[t, state]], xmax}
 */
export function lineChart(canvas, series, opts = {}) {
  const c = prep(canvas);
  if (!c) return;
  const { ctx, w, h } = c;
  const pad = { l: 40, r: 10, t: 10, b: 22 };
  const all = series.flatMap((s) => s.data);
  if (!all.length) {
    ctx.fillStyle = "#5d6c84";
    ctx.font = "12px Inter, sans-serif";
    ctx.fillText("waiting for data…", pad.l, h / 2);
    return;
  }
  const xmin = opts.xmin ?? Math.min(...all.map((d) => d[0]));
  const xmax = Math.max(opts.xmax ?? -Infinity, ...all.map((d) => d[0]), xmin + 1);
  let ymin = opts.ymin ?? Math.min(...all.map((d) => d[1]));
  let ymax = opts.ymax ?? Math.max(...all.map((d) => d[1]));
  if (opts.ymaxAuto) ymax = Math.max(opts.ymaxAuto, ...all.map((d) => d[1]));
  if (ymax - ymin < 1e-6) ymax = ymin + 1;
  const X = (t) => pad.l + ((t - xmin) / (xmax - xmin)) * (w - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - (v - ymin) / (ymax - ymin)) * (h - pad.t - pad.b);
  if (opts.states && opts.states.length) {
    for (let i = 0; i < opts.states.length; i++) {
      const [t0, st] = opts.states[i];
      const t1 = i + 1 < opts.states.length ? opts.states[i + 1][0] : xmax;
      ctx.fillStyle = STATE_FILL[st] || "#333";
      ctx.globalAlpha = 0.09;
      ctx.fillRect(X(t0), pad.t, Math.max(X(t1) - X(t0), 1), h - pad.t - pad.b);
      ctx.globalAlpha = 1;
    }
  }
  ctx.strokeStyle = "#1d2a40";
  ctx.lineWidth = 1;
  ctx.font = "10px JetBrains Mono, monospace";
  ctx.fillStyle = "#5d6c84";
  for (let i = 0; i <= 4; i++) {
    const v = ymin + ((ymax - ymin) * i) / 4;
    const y = Y(v);
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
    ctx.fillText(v.toFixed(Math.abs(ymax - ymin) < 3 ? 2 : 0), 2, y + 3);
  }
  const step = Math.max(10, Math.ceil((xmax - xmin) / 8 / 10) * 10);
  for (let t = Math.ceil(xmin / step) * step; t <= xmax; t += step) ctx.fillText(`${t}s`, X(t) - 8, h - 6);
  for (const s of series) {
    if (!s.data.length) continue;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width || 1.6;
    ctx.setLineDash(s.dash || []);
    ctx.beginPath();
    s.data.forEach(([t, v], i) => (i ? ctx.lineTo(X(t), Y(Math.min(Math.max(v, ymin), ymax))) : ctx.moveTo(X(t), Y(Math.min(Math.max(v, ymin), ymax)))));
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (opts.hlines) {
    for (const [v, col, lbl] of opts.hlines) {
      if (v < ymin || v > ymax) continue;
      ctx.strokeStyle = col; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.l, Y(v)); ctx.lineTo(w - pad.r, Y(v)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = col; ctx.fillText(lbl, w - pad.r - ctx.measureText(lbl).width - 2, Y(v) - 3);
    }
  }
  // legend
  let lx = pad.l + 6;
  ctx.font = "11px Inter, sans-serif";
  for (const s of series) {
    ctx.fillStyle = s.color;
    ctx.fillRect(lx, pad.t + 4, 10, 2);
    ctx.fillStyle = "#c9d4e5";
    ctx.fillText(s.label, lx + 14, pad.t + 9);
    lx += 24 + ctx.measureText(s.label).width;
  }
  if (opts.cursor !== undefined) {
    ctx.strokeStyle = "#e8eef7"; ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(X(opts.cursor), pad.t); ctx.lineTo(X(opts.cursor), h - pad.b); ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

export function stateBar(el, states, tmax) {
  if (!states.length) { el.innerHTML = ""; return; }
  const parts = [];
  for (let i = 0; i < states.length; i++) {
    const [t0, st] = states[i];
    const t1 = i + 1 < states.length ? states[i + 1][0] : tmax;
    parts.push(`<div title="${st} ${t0.toFixed(1)}–${t1.toFixed(1)} s" style="width:${(100 * (t1 - t0)) / Math.max(tmax, 1e-6)}%;background:${STATE_FILL[st]}"></div>`);
  }
  el.innerHTML = parts.join("");
}

export function polar(canvas, ranges, stopDist = 0.55, yaw = 0) {
  const c = prep(canvas);
  if (!c) return;
  const { ctx, w, h } = c;
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 18, maxr = 4;
  ctx.strokeStyle = "#1d2a40";
  for (const r of [1, 2, 3, 4]) { ctx.beginPath(); ctx.arc(cx, cy, (R * r) / maxr, 0, Math.PI * 2); ctx.stroke(); }
  ctx.fillStyle = "#5d6c84"; ctx.font = "10px JetBrains Mono, monospace";
  for (const r of [1, 2, 3]) ctx.fillText(`${r} m`, cx + 3, cy - (R * r) / maxr - 2);
  ctx.strokeStyle = "rgba(239,80,80,.6)"; ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.arc(cx, cy, (R * stopDist) / maxr, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  const n = ranges.length;
  ctx.beginPath();
  ranges.forEach((r, i) => {
    const a = (i / n) * Math.PI * 2;        // body frame: 0 = forward (up on screen), CCW = left
    const x = cx - Math.sin(a) * (R * Math.min(r, maxr)) / maxr;
    const y = cy - Math.cos(a) * (R * Math.min(r, maxr)) / maxr;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = "rgba(56,200,224,.12)"; ctx.fill();
  ctx.strokeStyle = "#38c8e0"; ctx.stroke();
  ranges.forEach((r, i) => {
    const a = (i / n) * Math.PI * 2;
    const x = cx - Math.sin(a) * (R * Math.min(r, maxr)) / maxr;
    const y = cy - Math.cos(a) * (R * Math.min(r, maxr)) / maxr;
    ctx.fillStyle = r < stopDist ? "#ef5050" : r < 1.0 ? "#f0b23a" : "#38c8e0";
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
  });
  ctx.fillStyle = "#e8eef7";
  ctx.beginPath(); ctx.moveTo(cx, cy - 9); ctx.lineTo(cx - 6, cy + 6); ctx.lineTo(cx + 6, cy + 6); ctx.fill();
  ctx.fillStyle = "#8a9ab3"; ctx.font = "11px Inter, sans-serif"; ctx.fillText("forward", cx - 20, 12);
}
