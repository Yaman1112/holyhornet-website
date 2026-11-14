/* Holy Hornet lesson figures and animated lesson videos.
   Lesson bodies (private, in Supabase) can contain two extra kinds of block:

   ::figure name key=value key="text with spaces" key=0>40
   Optional caption on the next line.

   ::video
   name key=value ... | Scene title | Narration spoken and shown as captions.
   (one scene per line)

   ::quiz Question text
   - a wrong option
   * the right option
   ? Optional explanation shown with the answers.
   (one block per question; the answers show once every question on the page is answered)

   A value written a>b is animated from a to b during a video scene; in a figure it becomes a slider.
   Everything is drawn here as SVG, so there are no image files to host. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var W = 960, H = 540;
  var C = { bg: '#121815', panel: '#1a221e', ink: '#ece8de', soft: '#a7afa7', dim: '#4c5650', grid: '#232c27',
    honey: '#efb446', sky: '#7cb9dc', red: '#ec8669', green: '#9ccf7f', violet: '#b9a3e8' };
  var FONT = '"Source Sans 3","Segoe UI",Arial,sans-serif';

  // ---------- drawing helpers ----------
  function S(tag, a, kids) {
    var n = document.createElementNS(NS, tag);
    Object.keys(a || {}).forEach(function (k) { if (a[k] !== null && a[k] !== undefined) n.setAttribute(k, a[k]); });
    (kids || []).forEach(function (k) { if (k) n.appendChild(k); });
    return n;
  }
  function T(x, y, s, o) {
    o = o || {};
    var t = S('text', { x: x, y: y, fill: o.col || C.ink, 'font-size': o.size || 20, 'font-family': FONT,
      'font-weight': o.weight || 600, 'text-anchor': o.anchor || 'start', 'letter-spacing': o.ls || null,
      transform: o.rot ? 'rotate(' + o.rot + ' ' + x + ' ' + y + ')' : null, opacity: o.op === undefined ? null : o.op });
    t.textContent = s;
    return t;
  }
  function L(x1, y1, x2, y2, col, w, dash, op) {
    return S('line', { x1: x1, y1: y1, x2: x2, y2: y2, stroke: col || C.ink, 'stroke-width': w || 2, 'stroke-dasharray': dash || null,
      'stroke-linecap': 'round', opacity: op === undefined ? null : op });
  }
  function P(d, o) {
    o = o || {};
    return S('path', { d: d, fill: o.fill || 'none', stroke: o.stroke || null, 'stroke-width': o.w || null,
      'stroke-dasharray': o.dash || null, 'stroke-dashoffset': o.off || null, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      opacity: o.op === undefined ? null : o.op, transform: o.tr || null });
  }
  function arrow(x1, y1, x2, y2, col, w, dash) {
    w = w || 4;
    var dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
    if (len < 2) return null;
    var ux = dx / len, uy = dy / len, h = Math.min(len, 9 + w * 2.4), hw = 4 + w * 1.4;
    var bx = x2 - ux * h, by = y2 - uy * h;
    return S('g', {}, [L(x1, y1, bx, by, col, w, dash),
      P('M' + f(x2) + ' ' + f(y2) + 'L' + f(bx - uy * hw) + ' ' + f(by + ux * hw) + 'L' + f(bx + uy * hw) + ' ' + f(by - ux * hw) + 'Z', { fill: col })]);
  }
  function f(n) { return Math.round(n * 10) / 10; }
  function rad(d) { return d * Math.PI / 180; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function G(tr, kids) { return S('g', { transform: tr }, kids); }
  function pathOf(pts) { return pts.map(function (p, i) { return (i ? 'L' : 'M') + f(p[0]) + ' ' + f(p[1]); }).join(''); }
  function label(x, y, s, col, size, anchor) { return T(x, y, s, { col: col || C.soft, size: size || 18, anchor: anchor, weight: 600 }); }
  function pill(x, y, s, col) {
    var w = s.length * 10.5 + 28;
    return S('g', {}, [S('rect', { x: x - w / 2, y: y - 22, width: w, height: 36, rx: 18, fill: C.panel, stroke: col || C.honey, 'stroke-width': 2 }),
      T(x, y + 2, s, { col: col || C.honey, size: 18, anchor: 'middle', weight: 700 })]);
  }
  function num(v, d) { return (Math.round(v * Math.pow(10, d || 0)) / Math.pow(10, d || 0)).toFixed(d || 0); }

  // ---------- graphs ----------
  function axes(o) {
    var X = function (v) { return o.x + (v - o.xr[0]) / (o.xr[1] - o.xr[0]) * o.w; };
    var Y = function (v) { return o.y + o.h - (v - o.yr[0]) / (o.yr[1] - o.yr[0]) * o.h; };
    var g = S('g');
    (o.xt || []).forEach(function (v) {
      g.appendChild(L(X(v), o.y, X(v), o.y + o.h, C.grid, 1.5));
      g.appendChild(T(X(v), o.y + o.h + 26, (o.xf ? o.xf(v) : v), { col: C.soft, size: 16, anchor: 'middle', weight: 500 }));
    });
    (o.yt || []).forEach(function (v) {
      g.appendChild(L(o.x, Y(v), o.x + o.w, Y(v), C.grid, 1.5));
      g.appendChild(T(o.x - 12, Y(v) + 5, (o.yf ? o.yf(v) : v), { col: C.soft, size: 16, anchor: 'end', weight: 500 }));
    });
    var y0 = o.yr[0] < 0 && o.yr[1] > 0 ? Y(0) : o.y + o.h;
    g.appendChild(L(o.x, y0, o.x + o.w, y0, C.soft, 2));
    g.appendChild(L(o.x, o.y, o.x, o.y + o.h, C.soft, 2));
    if (o.xl) g.appendChild(T(o.x + o.w, o.y + o.h + 52, o.xl, { col: C.ink, size: 18, anchor: 'end' }));
    if (o.yl) g.appendChild(T(o.x - 2, o.y - 16, o.yl, { col: C.ink, size: 18 }));
    return { g: g, X: X, Y: Y };
  }
  function plot(fn, a, b, A, col, w, dash, upto) {
    var pts = [], n = 160, end = upto === undefined ? b : a + (b - a) * clamp(upto, 0, 1);
    for (var i = 0; i <= n; i++) { var x = a + (end - a) * i / n, y = fn(x); if (isFinite(y)) pts.push([A.X(x), A.Y(y)]); }
    return P(pathOf(pts), { stroke: col, w: w || 4, dash: dash });
  }
  function dot(x, y, col, r) { return S('circle', { cx: x, cy: y, r: r || 9, fill: col || C.honey, stroke: C.bg, 'stroke-width': 3 }); }

  // ---------- aeroplane outlines ----------
  function sidePlane(cx, cy, sc, pitch, col, o) {
    o = o || {};
    col = col || C.ink;
    return G('translate(' + cx + ' ' + cy + ') rotate(' + (-pitch) + ') scale(' + sc + ')', [
      P('M128 -6C120 -20 90 -26 50 -27L-20 -24L-150 -10L-172 -8L-172 2L-150 6L-20 16C50 22 110 18 128 8Z', { fill: col }),
      P('M40 -24L70 -22L88 -12L40 -12Z', { fill: C.bg, op: 0.75 }),
      S('rect', { x: -32, y: -36, width: 86, height: 9, rx: 4.5, fill: col }),
      L(12, -28, -2, 12, col, 4),
      P('M-128 -12L-158 -64L-178 -64L-172 -8Z', { fill: col }),
      S('rect', { x: -184, y: -7, width: 52, height: 6, rx: 3, fill: col }),
      o.noProp ? null : L(134, -42, 134, 44, col, 4, null, 0.55),
      S('circle', { cx: 130, cy: 1, r: 7, fill: col }),
      L(68, 16, 74, 38, col, 4), S('circle', { cx: 74, cy: 44, r: 8, fill: col }),
      L(-12, 16, -18, 38, col, 4), S('circle', { cx: -18, cy: 44, r: 8, fill: col })
    ]);
  }
  function topPlane(cx, cy, sc, hdg, col, hl) {
    col = col || C.ink;
    hl = hl || {};
    var hc = function (k) { return hl[k] ? C.honey : C.dim; };
    return G('translate(' + cx + ' ' + cy + ') rotate(' + hdg + ') scale(' + sc + ')', [
      S('rect', { x: -22, y: -215, width: 62, height: 430, rx: 8, fill: col }),
      S('rect', { x: -22, y: -205, width: 15, height: 92, rx: 3, fill: hc('aileron') }),
      S('rect', { x: -22, y: 113, width: 15, height: 92, rx: 3, fill: hc('aileron') }),
      S('rect', { x: -22, y: -105, width: 15, height: 80, rx: 3, fill: hc('flap') }),
      S('rect', { x: -22, y: 25, width: 15, height: 80, rx: 3, fill: hc('flap') }),
      P('M132 0C126 -15 100 -21 60 -22L-150 -8L-182 -6L-182 6L-150 8L60 22C100 21 126 15 132 0Z', { fill: col }),
      S('rect', { x: -182, y: -78, width: 38, height: 156, rx: 5, fill: col }),
      S('rect', { x: -182, y: -74, width: 13, height: 148, rx: 3, fill: hc('elevator') }),
      S('rect', { x: -190, y: -5, width: 60, height: 10, rx: 4, fill: hl.rudder ? C.honey : col }),
      L(136, -48, 136, 48, col, 5, null, 0.6)
    ]);
  }
  function rearPlane(cx, cy, sc, bank, col, dihedral) {
    col = col || C.ink;
    var d = Math.tan(rad(dihedral === undefined ? 4 : dihedral)) * 230;
    return G('translate(' + cx + ' ' + cy + ') rotate(' + bank + ') scale(' + sc + ')', [
      P('M-232 ' + f(-d - 4) + 'L0 -6L232 ' + f(-d - 4) + 'L232 ' + f(-d + 6) + 'L0 6L-232 ' + f(-d + 6) + 'Z', { fill: col }),
      L(-85, -10, 85, -10, col, 6),
      P('M-5 -18L-7 -98L7 -98L5 -18Z', { fill: col }),
      S('circle', { cx: 0, cy: 0, r: 25, fill: col }),
      L(-20, 18, -48, 46, col, 5), L(20, 18, 48, 46, col, 5),
      S('circle', { cx: -50, cy: 50, r: 9, fill: col }), S('circle', { cx: 50, cy: 50, r: 9, fill: col })
    ]);
  }

  // ---------- aerofoil ----------
  function CLof(a, flaps) {
    var a0 = flaps ? -7 : -2, crit = flaps ? 13 : 16, k = 0.095;
    var lin = function (x) { return k * (x - a0) - (x > crit - 4 ? 0.01 * Math.pow(x - (crit - 4), 2) : 0); };
    if (a <= crit) return lin(a);
    var top = lin(crit), d = a - crit;
    return d < 2 ? top - 0.12 * d : top - 0.24 - 0.035 * (d - 2);
  }
  function foilPts(flap) {
    var m = 0.02, p = 0.4, t = 0.12, up = [], lo = [], n = 44, hinge = 0.72;
    var yc = function (x) { return x < p ? m / (p * p) * (2 * p * x - x * x) : m / ((1 - p) * (1 - p)) * ((1 - 2 * p) + 2 * p * x - x * x); };
    var hy = yc(hinge), fr = -rad(flap || 0);
    for (var i = 0; i <= n; i++) {
      var x = (1 - Math.cos(Math.PI * i / n)) / 2;
      var yt = 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1036 * x * x * x * x);
      var c = yc(x);
      [[x, c + yt, up], [x, c - yt, lo]].forEach(function (q) {
        var px = q[0], py = q[1];
        if (flap && px > hinge) { var dx = px - hinge, dy = py - hy; px = hinge + dx * Math.cos(fr) - dy * Math.sin(fr); py = hy + dx * Math.sin(fr) + dy * Math.cos(fr); }
        q[2].push([px, py]);
      });
    }
    return { up: up, lo: lo };
  }
  function foilTx(ox, oy, c, aoa) {
    var th = -rad(aoa), cs = Math.cos(th), sn = Math.sin(th);
    return function (x, y) { var X = (x - 0.25) * c, Y = y * c; return [ox + X * cs - Y * sn, oy - (X * sn + Y * cs)]; };
  }
  function aerofoil(p) {
    var aoa = +p.aoa || 0, show = String(p.show || 'flow'), flap = +p.flap || 0, t = p._t || 0;
    var ox = 430, oy = 280, c = 380, tx = foilTx(ox, oy, c, aoa), pts = foilPts(flap);
    var outline = pts.up.map(function (q) { return tx(q[0], q[1]); }).concat(pts.lo.slice().reverse().map(function (q) { return tx(q[0], q[1]); }));
    var LE = tx(0, 0), TE = tx(1, flap ? -0.28 * Math.sin(rad(flap)) : 0);
    var crit = flap ? 13 : 16, stalled = aoa > crit || show.indexOf('stall') !== -1;
    var g = [];
    if (/flow|stall|pressure/.test(show)) {
      [-170, -120, -82, -50, 52, 92, 140, 190].forEach(function (yo) {
        var upper = yo < 0, decay = Math.exp(-Math.abs(yo) / 140), pts2 = [];
        for (var x = 30; x <= 930; x += 12) {
          var s = (x - ox) / c, bump = Math.exp(-Math.pow((s - 0.1) / 0.42, 2));
          var dy = (upper ? -34 - aoa * 0.8 : 12 + aoa * 3.4) * bump * decay + aoa * 2.6 * Math.exp(-Math.abs(yo) / 260) * Math.tanh((s - 0.35) * 2.2) + (flap ? flap * 2 * decay * Math.max(0, Math.tanh((s - 0.55) * 2.5)) : 0);
          pts2.push([x, oy + yo + dy]);
        }
        var sep = stalled && upper && yo > -100;
        if (sep) pts2 = pts2.filter(function (q) { return q[0] < ox - 0.05 * c; });
        g.push(P(pathOf(pts2), { stroke: C.sky, w: upper && Math.abs(yo) < 100 ? 3 : 2.4, dash: '16 12', off: f(-t * (upper ? 95 : 60)), op: 0.85 }));
      });
      if (stalled) {
        for (var i = 0; i < 6; i++) {
          var sx = ox - 0.02 * c + i * 72, sy = oy - 40 - aoa * 1.2 - (i % 2) * 22 + i * 6, r = 16 + i * 4, a0 = t * 3 + i;
          g.push(P('M' + f(sx + r * Math.cos(a0)) + ' ' + f(sy + r * Math.sin(a0)) + 'A' + r + ' ' + r + ' 0 1 1 ' + f(sx + r * Math.cos(a0 + 4.5)) + ' ' + f(sy + r * Math.sin(a0 + 4.5)), { stroke: C.red, w: 3, op: 0.8 }));
        }
        g.push(label(ox + 0.4 * c, oy - 150 - aoa * 1.5, 'Airflow separates: turbulent wake', C.red, 19, 'middle'));
      }
    }
    if (show.indexOf('pressure') !== -1) {
      var k = clamp(CLof(aoa, flap), 0, 2);
      for (var j = 0; j < 5; j++) {
        var s1 = 0.08 + j * 0.15, a1 = tx(s1, 0.2), b1 = tx(s1, -0.16), r1 = 9 + k * 7 * (1 - j * 0.15);
        g.push(S('circle', { cx: a1[0], cy: a1[1], r: r1, fill: 'none', stroke: C.sky, 'stroke-width': 2.5 }), T(a1[0], a1[1] + 6, '−', { col: C.sky, size: 22, anchor: 'middle' }));
        g.push(S('circle', { cx: b1[0], cy: b1[1], r: 8 + k * 3, fill: 'none', stroke: C.red, 'stroke-width': 2.5 }), T(b1[0], b1[1] + 6, '+', { col: C.red, size: 20, anchor: 'middle' }));
      }
      g.push(label(ox, oy - 120, 'Faster flow, lower pressure', C.sky, 20, 'middle'), label(ox, oy + 130, 'Slower flow, higher pressure', C.red, 20, 'middle'));
    }
    if (p.slat) {
      var sl = pts.up.filter(function (q) { return q[0] < 0.1; }).map(function (q) { return tx(q[0] - 0.05, q[1] - 0.03); });
      g.push(P(pathOf(sl), { stroke: C.honey, w: 9 }), label(LE[0] - 20, LE[1] + 40, 'Slat', C.honey, 18, 'end'));
    }
    g.push(P(pathOf(outline) + 'Z', { fill: C.ink, stroke: C.ink, w: 1 }));
    if (flap) { var hp = tx(0.72, 0); g.push(label(hp[0] + 60, hp[1] + 70, 'Flap ' + Math.round(flap) + '°', C.honey, 20, 'middle')); }
    if (show.indexOf('terms') !== -1) {
      var ext = tx(-0.45, 0), tex = tx(1.12, 0);
      g.push(L(ext[0], ext[1], tex[0], tex[1], C.honey, 2.5, '10 8'));
      g.push(L(LE[0], LE[1], LE[0] - 200, LE[1], C.sky, 2.5, '4 8'));
      var r = 150, a2 = rad(aoa);
      if (Math.abs(aoa) > 0.5) g.push(P('M' + f(LE[0] - r) + ' ' + f(LE[1]) + 'A' + r + ' ' + r + ' 0 0 ' + (aoa > 0 ? 1 : 0) + ' ' + f(LE[0] - r * Math.cos(a2)) + ' ' + f(LE[1] - r * Math.sin(a2)), { stroke: C.honey, w: 3 }));
      g.push(T(LE[0] - r - 18, LE[1] - r * Math.sin(a2 / 2) + 6, 'α = ' + num(aoa) + '°', { col: C.honey, size: 22, anchor: 'end', weight: 700 }));
      g.push(label(LE[0] - 10, LE[1] + 42, 'Leading edge', C.ink, 18, 'end'), label(TE[0] + 14, TE[1] + 34, 'Trailing edge', C.ink, 18, 'start'));
      g.push(label(tex[0] + 6, tex[1] - 14, 'Chord line', C.honey, 18, 'start'));
      g.push(arrow(60, 470, 230, 470, C.sky, 3), label(60, 500, 'Relative airflow', C.sky, 18));
    }
    if (show.indexOf('forces') !== -1) {
      var cl = CLof(aoa, flap), cd = 0.03 + 0.05 * cl * cl + (aoa > crit ? 0.05 * (aoa - crit) : 0);
      var cpx = aoa > crit ? 0.42 : clamp(0.42 - 0.011 * aoa, 0.25, 0.45), cp = tx(cpx, 0.02), lift = cl * 150, drag = cd * 1100;
      g.push(arrow(cp[0], cp[1], cp[0] + drag, cp[1] - lift, C.soft, 3, '8 7'));
      g.push(arrow(cp[0], cp[1], cp[0], cp[1] - lift, C.honey, 6), arrow(cp[0], cp[1], cp[0] + drag, cp[1], C.red, 6));
      g.push(T(cp[0] - 14, cp[1] - lift + 10, 'Lift', { col: C.honey, size: 22, anchor: 'end', weight: 700 }), T(cp[0] + drag + 14, cp[1] + 8, 'Drag', { col: C.red, size: 22, weight: 700 }));
      g.push(label(cp[0] + drag + 12, cp[1] - lift, 'Total reaction', C.soft, 17));
    }
    if (show.indexOf('cp') !== -1) {
      var cpx2 = aoa > crit ? 0.42 : clamp(0.42 - 0.011 * aoa, 0.25, 0.45), q2 = tx(cpx2, 0.01);
      g.push(S('circle', { cx: q2[0], cy: q2[1], r: 11, fill: C.honey, stroke: C.bg, 'stroke-width': 3 }), L(q2[0], q2[1] + 14, q2[0], q2[1] + 80, C.honey, 2, '5 6'));
      g.push(label(q2[0], q2[1] + 104, 'Centre of pressure ' + Math.round(cpx2 * 100) + '% chord', C.honey, 19, 'middle'));
    }
    if (show.indexOf('aoa') !== -1) g.push(pill(800, 70, 'Angle of attack ' + num(aoa) + '°', stalled ? C.red : C.honey));
    return g;
  }

  // ---------- figures ----------
  var F = {};

  F.title = function (p) {
    var g = [], t = p._t || 0;
    for (var i = 0; i < 9; i++) for (var j = 0; j < 5; j++) {
      var x = 560 + i * 62 + (j % 2) * 31, y = 40 + j * 54, r = 30;
      var d = ''; for (var k = 0; k < 6; k++) { var a = rad(60 * k + 30); d += (k ? 'L' : 'M') + f(x + r * Math.cos(a)) + ' ' + f(y + r * Math.sin(a)); }
      g.push(P(d + 'Z', { stroke: C.honey, w: 2, op: f(0.06 + 0.12 * Math.max(0, Math.sin(t * 1.2 + i * 0.6 + j))) }));
    }
    g.push(T(80, 150, p.kicker || 'HOLY HORNET · FLIGHT SCHOOL', { col: C.honey, size: 20, weight: 700, ls: 3 }));
    var words = String(p.title || '').split(' '), lines = [''];
    words.forEach(function (w) { if ((lines[lines.length - 1] + ' ' + w).length > 26) lines.push(w); else lines[lines.length - 1] = (lines[lines.length - 1] + ' ' + w).trim(); });
    lines.forEach(function (s, i) { g.push(T(80, 230 + i * 70, s, { size: 62, weight: 700, col: C.ink })); });
    if (p.sub) g.push(T(80, 250 + lines.length * 70, p.sub, { size: 24, weight: 500, col: C.soft }));
    g.push(L(80, 470, 80 + 160 * clamp(t / 2, 0, 1), 470, C.honey, 5));
    return g;
  };

  F.aerofoil = aerofoil;

  F.liftcurve = function (p) {
    var A = axes({ x: 120, y: 70, w: 740, h: 360, xr: [-6, 22], yr: [-0.4, 2], xt: [-4, 0, 4, 8, 12, 16, 20], yt: [0, 0.5, 1, 1.5], xf: function (v) { return v + '°'; },
      xl: 'Angle of attack', yl: 'Lift coefficient CL' });
    var g = [A.g], aoa = +p.aoa;
    g.push(S('rect', { x: A.X(16), y: 70, width: A.X(22) - A.X(16), height: 360, fill: C.red, opacity: 0.08 }));
    g.push(T(A.X(19), 100, 'Stalled', { col: C.red, size: 18, anchor: 'middle' }));
    g.push(L(A.X(16), 70, A.X(16), 430, C.red, 2, '6 6'), T(A.X(16) - 8, 100, 'Critical angle', { col: C.red, size: 16, anchor: 'end' }));
    g.push(plot(function (a) { return CLof(a); }, -6, 22, A, C.honey, 5));
    if (+p.flaps) { g.push(plot(function (a) { return CLof(a, 1); }, -8, 22, A, C.sky, 4, '12 8')); g.push(T(A.X(-5), A.Y(1.85), 'Flaps down: more lift, lower stalling angle', { col: C.sky, size: 18 })); }
    if (+p.wings) {
      var a1 = clamp(aoa - 4, -6, 22), a2 = clamp(aoa + 4, -6, 22);
      g.push(dot(A.X(a1), A.Y(CLof(a1)), C.green), dot(A.X(a2), A.Y(CLof(a2)), C.red));
      g.push(T(A.X(a1) - 14, A.Y(CLof(a1)) - 18, 'Rising wing', { col: C.green, size: 18, anchor: 'end' }), T(A.X(a2) + 14, A.Y(CLof(a2)) + 34, 'Dropping wing: deeper stall', { col: C.red, size: 18 }));
    } else if (!isNaN(aoa)) {
      var st = aoa > 16;
      g.push(L(A.X(aoa), A.Y(CLof(aoa)), A.X(aoa), A.Y(-0.4), st ? C.red : C.honey, 2, '4 6'), dot(A.X(aoa), A.Y(CLof(aoa)), st ? C.red : C.honey));
      g.push(pill(760, 40, 'α ' + num(aoa) + '°  ·  CL ' + num(CLof(aoa), 2), st ? C.red : C.honey));
    }
    return g;
  };

  F.dragcurve = function (p) {
    var k1 = 50 / 5625, k2 = 50 * 5625, v = +p.v;
    var A = axes({ x: 120, y: 60, w: 760, h: 370, xr: [40, 160], yr: [0, 260], xt: [40, 60, 80, 100, 120, 140, 160], yt: [0, 50, 100, 150, 200, 250], yf: function () { return ''; },
      xl: 'Airspeed (kt)', yl: 'Drag' });
    var g = [A.g];
    var par = function (x) { return k1 * x * x; }, ind = function (x) { return k2 / (x * x); }, tot = function (x) { return par(x) + ind(x); };
    g.push(plot(par, 40, 160, A, C.sky, 4, '12 8'), plot(ind, 40, 160, A, C.red, 4, '12 8'), plot(tot, 40, 160, A, C.honey, 5));
    g.push(T(A.X(122), A.Y(par(122)) + 34, 'Parasite drag', { col: C.sky, size: 19 }), T(A.X(158), A.Y(ind(158)) - 14, 'Induced drag', { col: C.red, size: 19, anchor: 'end' }), T(A.X(140), A.Y(tot(140)) - 16, 'Total drag', { col: C.honey, size: 20, anchor: 'end' }));
    g.push(L(A.X(75), A.Y(140), A.X(75), A.Y(0), C.soft, 2, '5 6'), T(A.X(75), A.Y(150), 'Minimum drag · best L/D', { col: C.ink, size: 18, anchor: 'middle' }));
    if (!isNaN(v)) g.push(dot(A.X(v), A.Y(tot(v))), pill(780, 34, num(v) + ' kt: ' + (ind(v) > par(v) ? 'induced drag dominates' : 'parasite drag dominates'), C.honey));
    return g;
  };

  F.forces = function (p) {
    var pitch = +p.pitch || 0, cx = 480, cy = 280, g = [];
    var l = p.lift === undefined ? 140 : +p.lift, wt = p.weight === undefined ? 140 : +p.weight, th = p.thrust === undefined ? 130 : +p.thrust, dr = p.drag === undefined ? 130 : +p.drag;
    var hl = String(p.hl || '');
    g.push(L(60, 470, 900, 470, C.dim, 2));
    if (p.prop) for (var i = 0; i < 4; i++) { var ph = (p._t || 0) * 4 + i * 1.6; g.push(P('M' + (cx + 70 - i * 60) + ' ' + f(cy - 18 + Math.sin(ph) * 22) + 'q-30 ' + f(Math.cos(ph) * 30) + ' -60 0', { stroke: C.sky, w: 3, op: 0.7 })); }
    g.push(sidePlane(cx, cy, 1.05, pitch));
    var s = Math.sin(rad(pitch)), c = Math.cos(rad(pitch));
    var w = function (k) { return !hl || hl.indexOf(k) !== -1 ? 1 : 0.25; };
    g.push(S('g', { opacity: w('L') }, [arrow(cx, cy - 30, cx - s * l * 0, cy - 30 - l, C.honey, 6), T(cx + 16, cy - 40 - l, 'Lift', { col: C.honey, size: 24, weight: 700 })]));
    g.push(S('g', { opacity: w('W') }, [arrow(cx, cy + 10, cx, cy + 10 + wt, C.ink, 6), T(cx + 16, cy + wt, 'Weight', { col: C.ink, size: 24, weight: 700 })]));
    g.push(S('g', { opacity: w('T') }, [arrow(cx + 140 * c, cy - 140 * s, cx + (140 + th) * c, cy - (140 + th) * s, C.green, 6), T(cx + (150 + th) * c, cy - (140 + th) * s - 18, 'Thrust', { col: C.green, size: 24, weight: 700, anchor: 'end' })]));
    g.push(S('g', { opacity: w('D') }, [arrow(cx - 190 * c, cy + 190 * s, cx - (190 + dr) * c, cy + (190 + dr) * s, C.red, 6), T(cx - (190 + dr) * c, cy + (190 + dr) * s + 36, 'Drag', { col: C.red, size: 24, weight: 700 })]));
    if (p.note) g.push(pill(480, 60, String(p.note), C.honey));
    return g;
  };

  F.induced = function (p) {
    var w = +p.w || 0, g = [], tx = foilTx(420, 300, 300, 5), pts = foilPts(0);
    var outline = pts.up.map(function (q) { return tx(q[0], q[1]); }).concat(pts.lo.slice().reverse().map(function (q) { return tx(q[0], q[1]); }));
    g.push(P(pathOf(outline) + 'Z', { fill: C.ink }));
    g.push(arrow(80, 450, 260, 450, C.sky, 3), label(80, 485, 'Relative airflow', C.sky));
    var cp = tx(0.3, 0.02), Lh = 210, a = rad(w);
    g.push(arrow(cp[0], cp[1], cp[0], cp[1] - Lh, C.soft, 3, '6 7'), T(cp[0] - 12, cp[1] - Lh, 'Lift without downwash', { col: C.soft, size: 17, anchor: 'end' }));
    g.push(arrow(cp[0], cp[1], cp[0] + Math.sin(a) * Lh, cp[1] - Math.cos(a) * Lh, C.honey, 6), T(cp[0] + Math.sin(a) * Lh + 18, cp[1] - Math.cos(a) * Lh + 10, 'Lift, tilted back', { col: C.honey, size: 20, weight: 700 }));
    if (w > 0.5) g.push(arrow(cp[0], cp[1] + 60, cp[0] + Math.sin(a) * Lh, cp[1] + 60, C.red, 6), T(cp[0] + Math.sin(a) * Lh + 14, cp[1] + 68, 'Induced drag', { col: C.red, size: 21, weight: 700 }));
    var te = tx(1, 0);
    g.push(arrow(te[0] + 20, te[1] + 6, te[0] + 220, te[1] + 6 + Math.tan(a) * 200 * 2.2, C.sky, 3, '10 8'), label(te[0] + 40, te[1] + 80 + w * 6, 'Downwash', C.sky));
    g.push(pill(780, 60, 'Downwash angle ' + num(w) + '°', C.honey));
    return g;
  };

  F.forms = function (p) {
    var hl = String(p.hl || ''), t = p._t || 0, g = [];
    var shapes = [['plate', 170, 'Flat plate', 'Very wide wake'], ['ball', 480, 'Round body', 'Wide wake'], ['stream', 790, 'Streamlined', 'Narrow wake']];
    shapes.forEach(function (s) {
      var x = s[1], y = 260, on = !hl || hl === s[0], wake = s[0] === 'plate' ? 80 : s[0] === 'ball' ? 52 : 12, gg = [];
      for (var i = -2; i <= 2; i++) gg.push(P('M' + (x - 140) + ' ' + (y + i * 40) + 'C' + (x - 60) + ' ' + (y + i * 40) + ' ' + (x - 40) + ' ' + (y + i * (40 + (wake > 20 ? 18 : 6))) + ' ' + x + ' ' + (y + i * (40 + (wake > 20 ? 20 : 6))), { stroke: C.sky, w: 2, op: 0.7, dash: '12 10', off: f(-t * 70) }));
      for (var j = 0; j < 4; j++) { var r = 6 + wake / 6, wx = x + 40 + j * 26, wy = y + Math.sin(t * 3 + j) * wake * 0.5; gg.push(S('circle', { cx: wx, cy: wy, r: r, fill: 'none', stroke: C.red, 'stroke-width': 2.5, opacity: wake > 20 ? 0.8 : 0.4 })); }
      if (s[0] === 'plate') gg.push(S('rect', { x: x - 8, y: y - 70, width: 16, height: 140, rx: 4, fill: C.ink }));
      else if (s[0] === 'ball') gg.push(S('circle', { cx: x, cy: y, r: 55, fill: C.ink }));
      else gg.push(P('M' + (x - 70) + ' ' + y + 'C' + (x - 70) + ' ' + (y - 40) + ' ' + (x - 20) + ' ' + (y - 42) + ' ' + x + ' ' + (y - 36) + 'L' + (x + 100) + ' ' + y + 'L' + x + ' ' + (y + 36) + 'C' + (x - 20) + ' ' + (y + 42) + ' ' + (x - 70) + ' ' + (y + 40) + ' ' + (x - 70) + ' ' + y + 'Z', { fill: C.ink }));
      gg.push(T(x, 420, s[2], { size: 22, anchor: 'middle', weight: 700 }), T(x, 450, s[3], { col: C.red, size: 18, anchor: 'middle' }));
      g.push(S('g', { opacity: on ? 1 : 0.25 }, gg));
    });
    return g;
  };

  F.vortex = function (p) {
    var h = p.h === undefined ? 3 : +p.h, t = p._t || 0, g = [], gy = 470, span = 460;
    var ground = h < 2.5, wy = ground ? clamp(gy - 40 - h * span * 0.55, 160, gy - 40) : 250;
    if (ground) { g.push(S('rect', { x: 0, y: gy, width: W, height: H - gy, fill: C.panel }), L(0, gy, W, gy, C.soft, 2)); }
    g.push(rearPlane(480, wy, 1, 0, C.ink, 3));
    var r = ground ? clamp(18 + h * 60, 18, 70) : 70;
    [-1, 1].forEach(function (sd) {
      var cx = 480 + sd * 236, cy = wy + 6;
      for (var k = 0; k < 3; k++) { var rr = r * (1 - k * 0.28), a = t * 4 * sd + k; g.push(P('M' + f(cx + rr * Math.cos(a)) + ' ' + f(cy + rr * Math.sin(a)) + 'A' + f(rr) + ' ' + f(rr) + ' 0 1 ' + (sd > 0 ? 1 : 0) + ' ' + f(cx + rr * Math.cos(a + 4.6 * sd)) + ' ' + f(cy + rr * Math.sin(a + 4.6 * sd)), { stroke: C.sky, w: 3, op: 0.85 })); }
    });
    var dl = ground ? clamp(h * 120, 20, 110) : 110;
    [-120, -40, 40, 120].forEach(function (x) { g.push(arrow(480 + x, wy + 40, 480 + x, wy + 40 + dl, C.sky, 3)); });
    g.push(label(480, wy + 70 + dl, 'Downwash', C.sky, 18, 'middle'));
    if (ground) {
      var phi = Math.pow(16 * h * 0.5, 2) / (1 + Math.pow(16 * h * 0.5, 2));
      g.push(pill(480, 50, 'Height ' + num(h, 2) + ' × wingspan → induced drag ' + Math.round(phi * 100) + '% of normal', C.honey));
    } else g.push(label(480, 60, 'Air spills round the tips from high pressure below to low pressure above', C.ink, 21, 'middle'));
    return g;
  };

  F.glide = function (p) {
    var ld = +p.ld || 9, wind = +p.wind || 0, pos = p.pos === undefined ? 1 : clamp(+p.pos, 0, 1), g = [];
    var x0 = 110, y0 = 140, gy = 420, dist = ld * (1 + wind), x1 = x0 + 74 * dist;
    g.push(L(40, gy, 920, gy, C.soft, 2));
    g.push(L(x0, y0, x0, gy, C.honey, 3, '6 6'), T(x0 - 12, (y0 + gy) / 2, '1,000 m', { col: C.honey, size: 22, anchor: 'end', weight: 700 }));
    g.push(L(x0, y0, x1, gy, C.sky, 3, '12 8'));
    g.push(L(x0, gy + 30, x1, gy + 30, C.ink, 2), T((x0 + x1) / 2, gy + 64, num(dist, 1) + ' km over the ground', { size: 22, anchor: 'middle', weight: 700 }));
    var ang = Math.atan2(gy - y0, x1 - x0) * 180 / Math.PI;
    g.push(sidePlane(x0 + (x1 - x0) * pos, y0 + (gy - y0) * pos - 22, 0.32, -ang, C.ink, { noProp: true }));
    g.push(pill(760, 70, 'L/D ' + num(ld) + ' : 1' + (wind ? (wind < 0 ? ' · headwind' : ' · tailwind') : ' · still air'), C.honey));
    g.push(label(930, 520, 'Not to scale', C.dim, 15, 'end'));
    return g;
  };

  F.axes = function (p) {
    var hl = String(p.hl || 'all'), rot = +p.rot || 0, g = [];
    var panel = function (x, name, axis, ctrl, body, on) {
      var gg = [S('rect', { x: x - 140, y: 70, width: 280, height: 390, rx: 18, fill: C.panel, stroke: on ? C.honey : C.grid, 'stroke-width': on ? 3 : 1.5 })];
      gg.push(body, T(x, 395, name, { col: on ? C.honey : C.ink, size: 28, anchor: 'middle', weight: 700 }), T(x, 425, 'about the ' + axis, { col: C.soft, size: 18, anchor: 'middle' }), T(x, 450, ctrl, { col: C.soft, size: 18, anchor: 'middle' }));
      return S('g', { opacity: hl === 'all' || on ? 1 : 0.3 }, gg);
    };
    var r = function (k) { return hl === k ? rot : 0; };
    g.push(panel(170, 'Roll', 'longitudinal axis', 'Ailerons', S('g', {}, [rearPlane(170, 230, 0.5, r('roll')), S('circle', { cx: 170, cy: 230, r: 6, fill: C.honey })]), hl === 'roll'));
    g.push(panel(480, 'Pitch', 'lateral axis', 'Elevator', S('g', {}, [sidePlane(480, 230, 0.62, r('pitch')), S('circle', { cx: 480, cy: 230, r: 6, fill: C.honey })]), hl === 'pitch'));
    g.push(panel(790, 'Yaw', 'normal axis', 'Rudder', S('g', {}, [topPlane(790, 230, 0.5, -r('yaw')), S('circle', { cx: 790, cy: 230, r: 6, fill: C.honey })]), hl === 'yaw'));
    g.push(label(480, 510, 'All three axes pass through the centre of gravity', C.ink, 20, 'middle'));
    return g;
  };

  F.stability = function (p) {
    var type = String(p.type || 'positive'), pr = p.p === undefined ? 1 : +p.p;
    var A = axes({ x: 110, y: 70, w: 780, h: 340, xr: [0, 10], yr: [-1.6, 1.6], xt: [0, 2, 4, 6, 8, 10], yt: [-1, 0, 1], yf: function (v) { return v ? '' : 'Trim'; }, xl: 'Time after a gust', yl: 'Pitch away from trim' });
    var fns = { positive: function (x) { return Math.exp(-0.35 * x) * Math.cos(2 * x); }, neutral: function (x) { return Math.cos(2 * x); },
      negative: function (x) { return 0.35 * Math.exp(0.15 * x) * Math.cos(2 * x); }, divergent: function (x) { return Math.min(1.6, 0.3 * Math.exp(0.3 * x)); } };
    var names = { positive: 'Positive dynamic stability: oscillations die away', neutral: 'Neutral dynamic stability: oscillations continue', negative: 'Negative dynamic stability: oscillations grow', divergent: 'Negative static stability: moves further away' };
    var col = type === 'positive' ? C.green : type === 'neutral' ? C.honey : C.red;
    return [A.g, plot(fns[type] || fns.positive, 0, 10, A, col, 5, null, pr), pill(480, 505, names[type] || '', col)];
  };

  F.balance = function (p) {
    var cg = +p.cg || 0, g = [], cx = 470, cy = 290;
    g.push(sidePlane(cx, cy, 1.4, 0, C.ink));
    var gx = cx + 40 + cg * 30, px = cx - 10, tx = cx - 230;
    g.push(arrow(gx, cy, gx, cy + 150, C.ink, 6), S('circle', { cx: gx, cy: cy, r: 12, fill: C.honey, stroke: C.bg, 'stroke-width': 3 }), T(gx + 18, cy + 140, 'Weight at CG', { size: 21, weight: 700 }));
    g.push(arrow(px, cy - 50, px, cy - 220, C.honey, 6), T(px - 16, cy - 200, 'Lift at centre of pressure', { col: C.honey, size: 21, anchor: 'end', weight: 700 }));
    g.push(arrow(tx, cy - 100, tx, cy - 20, C.sky, 5), T(tx, cy - 112, 'Tail down-force', { col: C.sky, size: 20, anchor: 'middle', weight: 700 }));
    g.push(pill(480, 500, cg > 0.5 ? 'Forward CG: more stable, heavier controls' : cg < -0.5 ? 'Aft CG: less stable, lighter controls' : 'CG ahead of the centre of pressure, balanced by the tail', cg < -0.5 ? C.red : C.honey));
    return g;
  };

  F.dihedral = function (p) {
    var roll = p.roll === undefined ? 14 : +p.roll, g = [];
    g.push(rearPlane(480, 270, 1.15, roll, C.ink, 7));
    g.push(arrow(860, 380, 700, 360, C.sky, 4), arrow(860, 440, 700, 420, C.sky, 4), label(870, 470, 'Sideslip', C.sky, 20, 'end'));
    if (roll > 3) g.push(T(480, 500, 'Lower wing meets the sideslip at a higher angle of attack: more lift', { col: C.honey, size: 20, anchor: 'middle', weight: 700 }), arrow(700, 360, 700, 280, C.honey, 5));
    g.push(pill(480, 60, 'Dihedral rolls the wings back towards level', C.honey));
    return g;
  };

  F.loadfactor = function (p) {
    var bank = +p.bank;
    var A = axes({ x: 110, y: 60, w: 760, h: 360, xr: [0, 80], yr: [0, 6], xt: [0, 15, 30, 45, 60, 75], yt: [0, 1, 2, 3, 4, 5, 6], xf: function (v) { return v + '°'; }, yf: function (v) { return v + ' g'; }, xl: 'Bank angle in a level turn', yl: 'Load factor' });
    var n = function (b) { return 1 / Math.cos(rad(b)); };
    var g = [A.g, plot(n, 0, 80, A, C.honey, 5), plot(function (b) { return Math.sqrt(n(b)); }, 0, 80, A, C.sky, 4, '12 8')];
    g.push(T(A.X(67), A.Y(n(67)) + 6, 'n = 1 ÷ cos(bank)', { col: C.honey, size: 19, anchor: 'end' }), T(A.X(79), A.Y(Math.sqrt(n(79))) + 40, 'Stall speed factor √n', { col: C.sky, size: 19, anchor: 'end' }));
    if (!isNaN(bank)) {
      g.push(dot(A.X(bank), A.Y(n(bank))), dot(A.X(bank), A.Y(Math.sqrt(n(bank))), C.sky, 7));
      g.push(pill(480, 488, num(bank) + '° bank → ' + num(n(bank), 2) + ' g · stall speed +' + Math.round((Math.sqrt(n(bank)) - 1) * 100) + '%', C.honey));
    }
    return g;
  };

  F.turn = function (p) {
    var b = +p.bank || 0, g = [], cx = 480, cy = 300, wv = 120, lt = clamp(wv / Math.cos(rad(b)), wv, 330);
    g.push(rearPlane(cx, cy, 0.85, b));
    var lx = cx + Math.sin(rad(b)) * lt, ly = cy - 40 - Math.cos(rad(b)) * lt;
    g.push(arrow(cx, cy - 40, lx, ly, C.honey, 6), T(lx + 14, ly, 'Lift', { col: C.honey, size: 24, weight: 700 }));
    if (b > 2) {
      g.push(arrow(cx, cy - 40, cx, ly, C.soft, 3, '7 7'), arrow(cx, ly, lx, ly, C.green, 4, '7 7'));
      g.push(L(40, 470, 80, 470, C.soft, 3, '7 7'), T(92, 476, 'Vertical part: supports the weight', { col: C.soft, size: 18 }), L(40, 505, 80, 505, C.green, 3, '7 7'), T(92, 511, 'Horizontal part: turns the aeroplane', { col: C.green, size: 18 }));
    }
    g.push(arrow(cx, cy + 30, cx, cy + 30 + wv, C.ink, 6), T(cx + 14, cy + 20 + wv, 'Weight', { size: 22, weight: 700 }));
    g.push(pill(800, 490, num(b) + '° bank · ' + num(1 / Math.cos(rad(b)), 2) + ' g', C.honey));
    return g;
  };

  F.vg = function (p) {
    var vs = 50, vneg = 64, va = vs * Math.sqrt(3.8), vne = 150, g = [];
    var A = axes({ x: 110, y: 50, w: 760, h: 390, xr: [0, 170], yr: [-2.2, 4.6], xt: [0, 50, 100, 150], yt: [-2, -1, 0, 1, 2, 3, 4], yf: function (v) { return v + ' g'; }, xl: 'Indicated airspeed (kt)', yl: 'Load factor' });
    g.push(A.g);
    var top = [], bot = [];
    for (var v = vs; v <= vne; v += 2) top.push([A.X(v), A.Y(Math.min(3.8, Math.pow(v / vs, 2)))]);
    for (var v2 = vne; v2 >= vneg; v2 -= 2) bot.push([A.X(v2), A.Y(Math.max(-1.52, -Math.pow(v2 / vneg, 2)))]);
    g.push(P(pathOf(top.concat([[A.X(vne), A.Y(3.8)], [A.X(vne), A.Y(-1.52)]]).concat(bot)) + 'L' + A.X(vneg) + ' ' + A.Y(-1) + 'L' + A.X(vs) + ' ' + A.Y(1) + 'Z', { fill: 'rgba(239,180,70,.13)', stroke: C.honey, w: 4 }));
    g.push(T(A.X(62), A.Y(2.6), 'Stall line', { col: C.red, size: 18, anchor: 'end' }), T(A.X(125), A.Y(3.8) - 12, 'Limit +3.8 g', { col: C.honey, size: 18, anchor: 'middle' }), T(A.X(125), A.Y(-1.52) + 28, 'Limit −1.52 g', { col: C.honey, size: 18, anchor: 'middle' }));
    g.push(L(A.X(va), A.Y(3.8), A.X(va), A.Y(-2.2), C.sky, 2, '6 6'), T(A.X(va) + 8, A.Y(-1.9), 'VA', { col: C.sky, size: 20, weight: 700 }));
    g.push(T(A.X(vne) + 8, A.Y(1), 'VNE', { col: C.red, size: 20, weight: 700 }));
    if (p.v !== undefined) {
      var pv = +p.v, pn = +p.n, inside = pn <= Math.min(3.8, Math.pow(pv / vs, 2)) && pn >= Math.max(-1.52, -Math.pow(pv / vneg, 2)) && pv <= vne;
      var over = pn > 3.8 || pn < -1.52 || pv > vne;
      g.push(dot(A.X(pv), A.Y(pn), inside ? C.green : C.red), pill(700, 30, inside ? 'Inside the envelope' : over ? 'Overstress' : 'Stalled', inside ? C.green : C.red));
    }
    return g;
  };

  F.controls = function (p) {
    var s = String(p.s || 'aileron'), d = +p.d || 0, g = [], hl = {};
    hl[s] = true;
    g.push(topPlane(400, 270, 0.95, -90, C.ink, hl));
    var info = { aileron: ['Ailerons', 'Roll', 'longitudinal axis'], elevator: ['Elevator', 'Pitch', 'lateral axis'], rudder: ['Rudder', 'Yaw', 'normal axis'], flap: ['Flaps', 'More lift and drag', 'both wings together'] }[s] || ['', '', ''];
    g.push(T(720, 150, info[0], { col: C.honey, size: 40, weight: 700 }), T(720, 192, '→ ' + info[1], { size: 28, weight: 700 }), T(720, 226, info[2], { col: C.soft, size: 20 }));
    // inset: the surface seen from the side
    var tx = foilTx(780, 380, 170, 2), pts = foilPts(d * 25);
    var out = pts.up.map(function (q) { return tx(q[0], q[1]); }).concat(pts.lo.slice().reverse().map(function (q) { return tx(q[0], q[1]); }));
    g.push(S('rect', { x: 660, y: 300, width: 260, height: 160, rx: 14, fill: C.panel }), P(pathOf(out) + 'Z', { fill: C.ink }), T(790, 445, d > 0.05 ? 'Surface down: more lift' : d < -0.05 ? 'Surface up: less lift' : 'Neutral', { col: C.soft, size: 16, anchor: 'middle' }));
    if (+p.yaw) {
      g.push(arrow(240, 300, 240, 380, C.red, 5), T(60, 420, 'Down aileron: more lift, more drag', { col: C.red, size: 18 }));
      g.push(arrow(430, 105, 360, 120, C.red, 4), T(345, 100, 'Adverse yaw', { col: C.red, size: 20, anchor: 'end', weight: 700 }), T(60, 470, 'Rolling right, the nose swings left', { col: C.soft, size: 18 }));
    }
    return g;
  };

  F.trimtab = function (p) {
    var tr = +p.trim || 0, g = [], tx = foilTx(300, 280, 300, 0), pts = foilPts(0);
    var shape = function (pp, t2) { return pp.up.map(function (q) { return t2(q[0], q[1]); }).concat(pp.lo.slice().reverse().map(function (q) { return t2(q[0], q[1]); })); };
    g.push(P(pathOf(shape(pts, tx)) + 'Z', { fill: C.ink }), label(300, 220, 'Tailplane', C.ink, 20, 'middle'));
    var hx = 300 + 0.75 * 300, ea = -tr * 12, ta = tr * 28;
    var el = G('rotate(' + ea + ' ' + hx + ' 280)', [S('rect', { x: hx, y: 274, width: 150, height: 12, rx: 6, fill: C.honey }), G('rotate(' + ta + ' ' + (hx + 150) + ' 280)', [S('rect', { x: hx + 150, y: 276, width: 60, height: 8, rx: 4, fill: C.sky })])]);
    g.push(el, label(hx + 75, 340, 'Elevator', C.honey, 20, 'middle'), label(hx + 200, 380, 'Trim tab', C.sky, 20, 'middle'));
    g.push(pill(480, 470, tr > 0.1 ? 'Tab down → elevator up → nose-up trim' : tr < -0.1 ? 'Tab up → elevator down → nose-down trim' : 'Trim neutral', C.honey));
    return g;
  };

  F.climb = function (p) {
    var gm = p.g === undefined ? 10 : +p.g, g = [], cx = 470, cy = 280, s = Math.sin(rad(gm)), c = Math.cos(rad(gm));
    g.push(L(cx - 380 * c, cy + 380 * s, cx + 380 * c, cy - 380 * s, C.dim, 2, '10 10'), T(cx + 360 * c, cy - 380 * s - 16, 'Flight path', { col: C.soft, size: 18, anchor: 'end' }));
    g.push(sidePlane(cx, cy, 0.9, gm));
    var Wt = 170;
    g.push(arrow(cx, cy, cx, cy + Wt, C.ink, 6), T(cx + 12, cy + Wt + 4, 'Weight', { size: 22, weight: 700 }));
    g.push(arrow(cx, cy, cx - Wt * s * c, cy + Wt * s * s, C.red, 4, '7 7'), T(cx - 40, cy + 120, 'Part of the weight acts back along the path', { col: C.red, size: 18, anchor: 'end' }));
    g.push(arrow(cx + 130 * c, cy - 130 * s, cx + (130 + 90 + 140 * s) * c, cy - (130 + 90 + 140 * s) * s, C.green, 6), T(cx + (170 + 140 * s) * c, cy - (230 + 140 * s) * s - 30, 'Thrust', { col: C.green, size: 22, weight: 700 }));
    g.push(arrow(cx - 170 * c, cy + 170 * s, cx - 260 * c, cy + 260 * s, C.red, 6), T(cx - 270 * c, cy + 260 * s + 34, 'Drag', { col: C.red, size: 22, weight: 700 }));
    g.push(pill(480, 60, 'Climb angle ' + num(gm) + '°: thrust = drag + weight × sin(angle)', C.honey));
    return g;
  };

  F.vxvy = function (p) {
    var v = +p.v, g = [];
    var A = axes({ x: 110, y: 60, w: 760, h: 360, xr: [45, 115], yr: [0, 1.1], xt: [50, 60, 70, 80, 90, 100, 110], yt: [], xl: 'Indicated airspeed (kt)', yl: 'Climb performance' });
    var roc = function (x) { return Math.max(0, 1 - Math.pow((x - 76) / 34, 2)); }, ang = function (x) { return Math.max(0, roc(x) * 76 / x * 0.86 + 0.0 * x); };
    var am = 0; for (var x = 45; x < 115; x += 0.5) am = Math.max(am, ang(x));
    var angN = function (x) { return ang(x) / am; };
    g.push(A.g, plot(roc, 45, 115, A, C.honey, 5), plot(angN, 45, 115, A, C.sky, 4, '12 8'));
    var vx = 45; for (var x2 = 45; x2 < 115; x2 += 0.5) if (angN(x2) >= angN(vx)) vx = x2;
    g.push(L(A.X(76), A.Y(1), A.X(76), A.Y(0), C.honey, 2, '5 6'), T(A.X(76) + 8, A.Y(0.06), 'Vy', { col: C.honey, size: 22, weight: 700 }));
    g.push(L(A.X(vx), A.Y(1), A.X(vx), A.Y(0), C.sky, 2, '5 6'), T(A.X(vx) - 8, A.Y(0.06), 'Vx', { col: C.sky, size: 22, weight: 700, anchor: 'end' }));
    g.push(T(A.X(92), A.Y(roc(92)) - 14, 'Rate of climb (height per minute)', { col: C.honey, size: 18 }), T(A.X(84), A.Y(angN(84)) + 44, 'Angle of climb (height per distance)', { col: C.sky, size: 18 }));
    if (!isNaN(v)) g.push(dot(A.X(v), A.Y(roc(v))), dot(A.X(v), A.Y(angN(v)), C.sky, 7));
    g.push(label(870, 520, 'Typical shape; take the real speeds from the flight manual', C.dim, 15, 'end'));
    return g;
  };

  F.wingstall = function (p) {
    var pr = clamp(+p.p || 0, 0, 1), g = [], x0 = 150, x1 = 830, y0 = 200, ch = 150;
    g.push(S('rect', { x: x0, y: y0, width: x1 - x0, height: ch, rx: 14, fill: C.ink }));
    g.push(S('rect', { x: x1 - 260, y: y0 + ch - 34, width: 240, height: 34, rx: 6, fill: C.honey }), label(x1 - 140, y0 + ch + 34, 'Ailerons still working', C.honey, 19, 'middle'));
    g.push(S('rect', { x: x0, y: y0, width: (x1 - x0) * pr, height: ch, rx: 14, fill: C.red, opacity: 0.55 }));
    g.push(label(x0, y0 - 24, 'Wing root', C.ink, 20), label(x1, y0 - 24, 'Wingtip', C.ink, 20, 'end'));
    g.push(S('rect', { x: x0 + 40, y: y0 - 6, width: 70, height: 12, rx: 4, fill: C.sky }), label(x0 + 75, y0 + ch + 34, 'Stall strip', C.sky, 18, 'middle'));
    g.push(pill(480, 470, pr > 0.05 ? 'Stall spreads from the root (' + Math.round(pr * 100) + '% of span)' : 'Washout and stall strips make the root stall first', pr > 0.05 ? C.red : C.honey));
    return g;
  };

  F.spin = function (p) {
    var t = p._t || 0, rot = p.rot === undefined ? t * 120 : +p.rot, g = [], cx = 480;
    for (var k = 0; k < 5; k++) g.push(S('ellipse', { cx: cx, cy: 110 + k * 80, rx: 150, ry: 34, fill: 'none', stroke: C.dim, 'stroke-width': 2, 'stroke-dasharray': '8 8' }));
    g.push(L(cx, 70, cx, 470, C.soft, 2, '4 8'));
    var a = rad(rot), y = 110 + ((rot / 360 * 80) % 320 + 320) % 320;
    g.push(topPlane(cx + 150 * Math.cos(a), y + 34 * Math.sin(a), 0.22, rot + 90, C.honey));
    g.push(T(670, 150, 'Autorotation', { col: C.honey, size: 30, weight: 700 }), label(670, 190, 'One wing more deeply stalled', C.ink, 19), label(670, 220, 'Low, steady airspeed', C.ink, 19), label(670, 250, 'High rate of descent', C.ink, 19));
    return g;
  };

  F.spinspiral = function (p) {
    var pr = p.p === undefined ? 1 : +p.p, g = [];
    var A = axes({ x: 110, y: 60, w: 760, h: 360, xr: [0, 12], yr: [0, 180], xt: [0, 2, 4, 6, 8, 10, 12], yt: [0, 50, 100, 150], xl: 'Seconds', yl: 'Airspeed (kt)' });
    g.push(A.g, L(A.X(0), A.Y(150), A.X(12), A.Y(150), C.red, 2, '8 6'), T(A.X(12), A.Y(150) - 10, 'Never-exceed speed', { col: C.red, size: 17, anchor: 'end' }));
    g.push(plot(function (x) { return 55 + 12 * Math.exp(-x) * Math.cos(3 * x); }, 0, 12, A, C.sky, 5, null, pr));
    g.push(plot(function (x) { var y = 90 + 3.85 * x * x; return y > 178 ? NaN : y; }, 0, 12, A, C.honey, 5, null, pr));
    g.push(T(A.X(11.8), A.Y(64) - 16, 'Spin: low and steady', { col: C.sky, size: 20, anchor: 'end', weight: 700 }), T(A.X(6.5), A.Y(160), 'Spiral dive: rising fast', { col: C.honey, size: 20, anchor: 'end', weight: 700 }));
    g.push(label(870, 520, 'Illustrative values', C.dim, 15, 'end'));
    return g;
  };

  F.crosswind = function (p) {
    var m = String(p.m || 'crab'), pr = clamp(p.p === undefined ? 0.5 : +p.p, 0, 1), t = p._t || 0, g = [];
    g.push(S('rect', { x: 420, y: 30, width: 120, height: 500, fill: '#2a312d' }));
    for (var i = 0; i < 9; i++) g.push(S('rect', { x: 476, y: 40 + i * 56, width: 8, height: 30, fill: C.ink, opacity: 0.6 }));
    for (var k = 0; k < 5; k++) { var x = ((t * 80 + k * 190) % 900) - 40; g.push(arrow(x, 90 + k * 90, x + 70, 90 + k * 90, C.sky, 3)); }
    label(60, 60, 'Wind', C.sky, 20);
    var y = 470 - pr * 360, crab = m === 'crab' ? (pr > 0.85 ? 0 : 14) : 0;
    g.push(topPlane(480, y, 0.32, -90 - crab, C.honey));
    g.push(T(60, 520, 'Wind', { col: C.sky, size: 20, weight: 700 }));
    if (m === 'crab') g.push(T(900, 120, 'Crab', { col: C.honey, size: 34, anchor: 'end', weight: 700 }), label(900, 156, pr > 0.85 ? 'Rudder lines the nose up at touchdown' : 'Nose into wind, track on the centreline', C.ink, 19, 'end'));
    else {
      g.push(T(900, 120, 'Wing down', { col: C.honey, size: 34, anchor: 'end', weight: 700 }), label(900, 156, 'Into-wind wing low, opposite rudder', C.ink, 19, 'end'));
      g.push(S('rect', { x: 680, y: 250, width: 240, height: 170, rx: 14, fill: C.panel }), rearPlane(800, 340, 0.4, -10, C.ink), label(800, 405, 'View from behind', C.soft, 16, 'middle'));
    }
    return g;
  };

  F.formula = function (p) {
    var parts = String(p.f || '').split('~'), hl = String(p.hl || '').split(','), g = [], sizes = parts.map(function (s) { return s.length * 34 + 16; });
    var total = sizes.reduce(function (a, b) { return a + b; }, 0), x = 480 - total / 2;
    parts.forEach(function (s, i) {
      var on = hl.indexOf(String(i)) !== -1;
      g.push(T(x + sizes[i] / 2, 290, s, { col: on ? C.honey : (hl[0] ? C.dim : C.ink), size: 60, anchor: 'middle', weight: 700 }));
      if (on) g.push(L(x + 12, 312, x + sizes[i] - 12, 312, C.honey, 5));
      x += sizes[i];
    });
    if (p.note) g.push(T(480, 400, String(p.note), { col: C.soft, size: 24, anchor: 'middle', weight: 500 }));
    if (p.head) g.push(T(480, 170, String(p.head), { col: C.honey, size: 22, anchor: 'middle', weight: 700, ls: 2 }));
    return g;
  };

  F.steps = function (p) {
    var items = String(p.items || '').split(';'), at = p.at === undefined ? items.length : +p.at, g = [];
    if (p.head) g.push(T(90, 80, String(p.head), { col: C.honey, size: 30, weight: 700 }));
    var h = Math.min(78, 400 / items.length);
    items.forEach(function (s, i) {
      var y = 120 + i * h, on = i < at, cur = i < at && i >= at - 1;
      g.push(S('g', { opacity: on ? 1 : 0.22 }, [S('rect', { x: 90, y: y, width: 780, height: h - 14, rx: 14, fill: cur ? C.honey : C.panel }),
        T(130, y + (h - 14) / 2 + 9, String(i + 1), { col: cur ? C.bg : C.honey, size: 26, weight: 700, anchor: 'middle' }),
        T(170, y + (h - 14) / 2 + 9, s.trim(), { col: cur ? C.bg : C.ink, size: 25, weight: 700 })]));
    });
    return g;
  };

  F.compare = function (p) {
    var a = String(p.a || '').split(';'), b = String(p.b || '').split(';'), g = [];
    [[a, 70, C.sky], [b, 500, C.honey]].forEach(function (col) {
      g.push(S('rect', { x: col[1], y: 50, width: 390, height: Math.max(a.length, b.length) * 64 + 50, rx: 18, fill: C.panel, stroke: col[2], 'stroke-width': 2 }));
      col[0].forEach(function (s, i) { g.push(T(col[1] + 28, i ? 150 + (i - 1) * 64 : 104, s.trim(), { col: i ? C.ink : col[2], size: i ? 22 : 32, weight: 700 })); });
    });
    return g;
  };

  F.facts = function (p) {
    var items = String(p.items || '').split(';'), g = [], n = items.length, cols = n > 4 ? 3 : n, w = 880 / cols;
    if (p.head) g.push(T(480, 90, String(p.head), { col: C.honey, size: 26, anchor: 'middle', weight: 700 }));
    items.forEach(function (s, i) {
      var rows = Math.ceil(n / cols), kv = s.split(':'), x = 40 + (i % cols) * w, y = 320 - rows * 85 + Math.floor(i / cols) * 170;
      var val = kv[1] ? kv[1].trim() : '', size = Math.min(40, (w - 50) / (val.length * 0.56));
      g.push(S('rect', { x: x + 10, y: y, width: w - 20, height: 150, rx: 16, fill: C.panel }), T(x + w / 2, y + 66 + size / 3, val, { col: C.honey, size: f(size), anchor: 'middle', weight: 700 }), T(x + w / 2, y + 120, kv[0].trim(), { col: C.soft, size: 20, anchor: 'middle' }));
    });
    return g;
  };

  // One cylinder of a four-stroke piston engine. stroke runs 0 to 4 (intake, compression, power, exhaust);
  // with no stroke given it runs by itself.
  F.fourstroke = function (p) {
    var ph = p.stroke === undefined ? (p._t || 0) * 0.45 : +p.stroke, cyc = ((ph % 4) + 4) % 4;
    if (p.stroke !== undefined && +p.stroke >= 4) cyc = 3.999;
    var idx = Math.floor(cyc), frac = cyc - idx, th = cyc * Math.PI, g = [];
    var cx = 330, ccy = 420, r = 44, rod = 150, headY = 150, wL = cx - 80, wR = cx + 80;
    var pinX = cx + r * Math.sin(th), pinY = ccy - r * Math.cos(th);
    var wristY = ccy - (r * Math.cos(th) + Math.sqrt(rod * rod - r * r * Math.sin(th) * Math.sin(th))), crown = wristY - 28;
    var names = ['Induction', 'Compression', 'Power', 'Exhaust'];
    var says = ['Piston moves down, inlet valve open: fuel-air mixture is drawn in', 'Both valves closed, piston moves up: the mixture is compressed',
      'Spark plugs fire: burning gas pushes the piston down', 'Exhaust valve open, piston moves up: burnt gas is pushed out'];
    var gas = [C.sky, C.sky, C.honey, C.soft][idx], gasOp = [0.18 + 0.2 * frac, 0.38 + 0.4 * frac, 0.85 - 0.5 * frac, 0.4 - 0.2 * frac][idx];
    var inOpen = idx === 0 ? Math.sin(frac * Math.PI) : 0, exOpen = idx === 3 ? Math.sin(frac * Math.PI) : 0;
    // ports
    g.push(P('M' + (wL - 110) + ' ' + (headY - 52) + 'H' + (cx - 40) + 'V' + headY, { stroke: C.dim, w: 26 }), P('M' + (wR + 110) + ' ' + (headY - 52) + 'H' + (cx + 40) + 'V' + headY, { stroke: C.dim, w: 26 }));
    if (inOpen > 0.05) g.push(arrow(wL - 105, headY - 52, cx - 62, headY - 52, C.sky, 5), T(cx - 70, headY - 80, 'Fuel-air mixture in', { col: C.sky, size: 18, weight: 700, anchor: 'end' }));
    if (exOpen > 0.05) g.push(arrow(cx + 62, headY - 52, wR + 105, headY - 52, C.red, 5), T(cx + 70, headY - 80, 'Exhaust out', { col: C.red, size: 18, weight: 700 }));
    // gas, cylinder, piston
    g.push(S('rect', { x: wL, y: headY, width: wR - wL, height: Math.max(2, crown - headY), fill: gas, opacity: f(gasOp) }));
    g.push(P('M' + wL + ' ' + (ccy - 70) + 'V' + headY + 'H' + wR + 'V' + (ccy - 70), { stroke: C.ink, w: 6 }));
    g.push(S('rect', { x: wL + 5, y: crown, width: wR - wL - 10, height: 56, rx: 6, fill: C.ink }), L(wL + 5, crown + 14, wR - 5, crown + 14, C.bg, 3), L(wL + 5, crown + 24, wR - 5, crown + 24, C.bg, 3));
    // connecting rod and crankshaft
    g.push(S('circle', { cx: cx, cy: ccy, r: r + 22, fill: C.panel, stroke: C.dim, 'stroke-width': 3 }), L(cx, wristY, pinX, pinY, C.soft, 12), L(cx, ccy, pinX, pinY, C.honey, 14),
      S('circle', { cx: cx, cy: wristY, r: 8, fill: C.bg, stroke: C.soft, 'stroke-width': 3 }), S('circle', { cx: pinX, cy: pinY, r: 9, fill: C.honey }), S('circle', { cx: cx, cy: ccy, r: 11, fill: C.ink }));
    // valves and spark plugs
    var valve = function (x, open, col) { var y = headY + open * 16; return S('g', {}, [L(x, headY - 40, x, y, col, 5), L(x - 20, y, x + 20, y, col, 7)]); };
    g.push(valve(cx - 40, inOpen, inOpen > 0.05 ? C.sky : C.ink), valve(cx + 40, exOpen, exOpen > 0.05 ? C.red : C.ink));
    g.push(S('rect', { x: cx - 7, y: headY - 34, width: 14, height: 36, rx: 3, fill: C.soft }));
    if (idx === 2 && frac < 0.3) { for (var k = 0; k < 8; k++) { var a = rad(k * 45 + 20); g.push(L(cx + 6 * Math.cos(a), headY + 12 + 6 * Math.sin(a), cx + 20 * Math.cos(a), headY + 12 + 20 * Math.sin(a), C.honey, 4)); } }
    g.push(label(cx, headY - 80, 'Spark plugs', C.soft, 16, 'middle'), label(wL - 12, crown + 34, 'Piston', C.soft, 16, 'end'), label(cx + r + 34, ccy + 6, 'Crankshaft', C.soft, 16), label(wL - 12, headY + 22, 'Inlet valve', C.soft, 16, 'end'), label(wR + 12, headY + 22, 'Exhaust valve', C.soft, 16));
    // stroke list
    names.forEach(function (n, i) {
      var y = 150 + i * 68, on = i === idx;
      g.push(S('rect', { x: 610, y: y, width: 290, height: 54, rx: 14, fill: on ? C.honey : C.panel }), T(642, y + 35, String(i + 1), { col: on ? C.bg : C.honey, size: 24, weight: 700, anchor: 'middle' }), T(672, y + 35, n, { col: on ? C.bg : C.ink, size: 24, weight: 700 }));
    });
    g.push(T(480, 505, says[idx], { col: C.ink, size: 19, anchor: 'middle', weight: 600 }));
    return g;
  };

  // ---------- render ----------
  function draw(name, params) {
    var fn = F[name], svg = S('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': params.alt || name, preserveAspectRatio: 'xMidYMid meet' });
    svg.appendChild(S('rect', { width: W, height: H, fill: C.bg }));
    try { (fn ? fn(params) : [T(480, 270, 'Unknown figure: ' + name, { anchor: 'middle', col: C.red })]).forEach(function (n) { if (n) svg.appendChild(n); }); }
    catch (e) { svg.appendChild(T(480, 270, 'Figure error: ' + e.message, { anchor: 'middle', col: C.red })); }
    return svg;
  }

  // "name a=1 b="two words" c=0>40" -> {name, args}
  function parseSpec(line) {
    var m = /^\s*([\w-]+)(.*)$/.exec(line || ''), args = {}, re = /([\w]+)=("([^"]*)"|\S+)/g, r;
    if (!m) return { name: '', args: args };
    while ((r = re.exec(m[2]))) args[r[1]] = r[3] !== undefined ? r[3] : r[2];
    return { name: m[1], args: args };
  }
  function tweenOf(v) { var m = /^(-?[\d.]+)>(-?[\d.]+)$/.exec(String(v)); return m ? [+m[1], +m[2]] : null; }
  function ease(x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }
  function resolve(args, prog, t) {
    var out = { _t: t };
    Object.keys(args).forEach(function (k) { var tw = tweenOf(args[k]); out[k] = tw ? tw[0] + (tw[1] - tw[0]) * ease(clamp(prog, 0, 1)) : args[k]; });
    return out;
  }

  function h(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }

  // A figure block in the lesson text, with sliders for any a>b values.
  function figure(spec, caption) {
    var s = parseSpec(spec), box = h('figure', 'hhf'), holder = h('div', 'hhf-art'), vals = {}, t0 = performance.now();
    Object.keys(s.args).forEach(function (k) { var tw = tweenOf(s.args[k]); vals[k] = tw ? tw[1] : s.args[k]; });
    var animated = /^(aerofoil|forms|vortex|spin|crosswind|title)$/.test(s.name) || (s.name === 'fourstroke' && s.args.stroke === undefined);
    function render() { var p = {}; Object.keys(vals).forEach(function (k) { p[k] = vals[k]; }); p._t = (performance.now() - t0) / 1000; holder.textContent = ''; holder.appendChild(draw(s.name, p)); }
    box.appendChild(holder);
    var ctl = h('div', 'hhf-controls');
    Object.keys(s.args).forEach(function (k) {
      var tw = tweenOf(s.args[k]);
      if (!tw) return;
      var lo = Math.min(tw[0], tw[1]), hi = Math.max(tw[0], tw[1]), lab = h('label', 'hhf-slider'), name = h('span', '', (s.args[k + 'Label'] || k));
      var input = document.createElement('input');
      input.type = 'range'; input.min = lo; input.max = hi; input.step = (hi - lo) > 20 ? 1 : (hi - lo) / 100; input.value = vals[k];
      input.addEventListener('input', function () { vals[k] = +input.value; render(); });
      lab.appendChild(name); lab.appendChild(input); ctl.appendChild(lab);
    });
    if (ctl.children.length) box.appendChild(ctl);
    if (caption) box.appendChild(h('figcaption', '', caption));
    render();
    if (animated) {
      var on = false, raf;
      var loop = function () { render(); raf = setTimeout(loop, 70); };
      if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { var vis = es[0].isIntersecting; if (vis && !on) { on = true; loop(); } else if (!vis && on) { on = false; clearTimeout(raf); } }).observe(box);
    }
    return box;
  }

  // ---------- the lesson video player ----------
  function sentences(s) { return (String(s).match(/[^.!?]+[.!?]+["')]?|[^.!?]+$/g) || []).map(function (x) { return x.trim(); }).filter(Boolean); }
  function pickVoice() {
    if (!('speechSynthesis' in window)) return null;
    var vs = speechSynthesis.getVoices().filter(function (v) { return /^en/i.test(v.lang); });
    var score = function (v) { return (/natural|neural|online/i.test(v.name) ? 8 : 0) + (/en-GB/i.test(v.lang) ? 4 : 0) + (/google uk english|sonia|ryan|libby|daniel|serena/i.test(v.name) ? 3 : 0) + (v.localService ? 0 : 1); };
    vs.sort(function (a, b) { return score(b) - score(a); });
    return vs[0] || null;
  }

  function video(lines, title) {
    var scenes = lines.map(function (ln) {
      var parts = ln.split('|'), spec = parseSpec(parts[0]);
      var say = (parts.slice(2).join('|') || '').trim();
      return { name: spec.name, args: spec.args, title: (parts[1] || '').trim(), say: say, dur: Math.max(5, say.split(/\s+/).length / 2.45 + 1.4) };
    }).filter(function (s) { return s.name; });
    var start = 0;
    scenes.forEach(function (s) { s.start = start; start += s.dur; });
    var total = start;

    var root = h('section', 'hhv'), stage = h('div', 'hhv-stage'), art = h('div', 'hhv-art'), chip = h('div', 'hhv-chip'), brand = h('div', 'hhv-brand', 'HOLY HORNET'), cap = h('div', 'hhv-cap');
    var big = h('button', 'hhv-big'); big.type = 'button'; big.setAttribute('aria-label', 'Play lesson video'); big.innerHTML = '<span>▶</span>';
    stage.appendChild(art); stage.appendChild(chip); stage.appendChild(brand); stage.appendChild(big);
    var bar = h('div', 'hhv-bar'), play = h('button', 'hhv-btn', '▶'), track = h('div', 'hhv-track'), fill = h('div', 'hhv-fill'), time = h('span', 'hhv-time');
    var voiceBtn = h('button', 'hhv-btn hhv-txt', 'Voice on'), ccBtn = h('button', 'hhv-btn hhv-txt', 'CC'), fsBtn = h('button', 'hhv-btn', '⛶');
    [play, voiceBtn, ccBtn, fsBtn].forEach(function (b) { b.type = 'button'; });
    play.setAttribute('aria-label', 'Play'); fsBtn.setAttribute('aria-label', 'Full screen'); ccBtn.setAttribute('aria-pressed', 'true');
    track.appendChild(fill);
    scenes.forEach(function (s, i) { if (i) { var tick = h('i'); tick.style.left = (s.start / total * 100) + '%'; track.appendChild(tick); } });
    track.setAttribute('role', 'slider'); track.setAttribute('aria-label', 'Seek'); track.tabIndex = 0;
    bar.appendChild(play); bar.appendChild(track); bar.appendChild(time); bar.appendChild(voiceBtn); bar.appendChild(ccBtn); bar.appendChild(fsBtn);
    var chapters = h('ol', 'hhv-chapters');
    scenes.forEach(function (s, i) {
      var li = h('li'), b = h('button', '', s.title || ('Part ' + (i + 1)));
      b.type = 'button'; b.addEventListener('click', function () { seek(s.start, true); });
      li.appendChild(b); chapters.appendChild(li);
    });
    root.appendChild(stage); root.appendChild(cap); root.appendChild(bar); root.appendChild(chapters);

    var t = 0, playing = false, last = 0, idx = -1, voiceOn = 'speechSynthesis' in window, cc = true, speaking = false, queue = [], qi = 0, timer = null;
    if (!voiceOn) { voiceBtn.textContent = 'No voice'; voiceBtn.disabled = true; }
    function sceneAt(x) { for (var i = scenes.length - 1; i >= 0; i--) if (x >= scenes[i].start) return i; return 0; }
    function fmt(x) { x = Math.max(0, Math.floor(x)); return Math.floor(x / 60) + ':' + ('0' + x % 60).slice(-2); }
    function stopVoice() { speaking = false; queue = []; if ('speechSynthesis' in window) speechSynthesis.cancel(); }
    function speakFrom(i, k) {
      stopVoice();
      if (!voiceOn || !playing) return;
      queue = sentences(scenes[i].say); qi = k || 0;
      var voice = pickVoice();
      var next = function () {
        if (qi >= queue.length || !playing) { speaking = false; return; }
        var u = new SpeechSynthesisUtterance(queue[qi]), mine = queue;
        if (voice) u.voice = voice;
        u.lang = voice ? voice.lang : 'en-GB'; u.rate = 1;
        u.onend = u.onerror = function () { if (mine !== queue) return; qi++; next(); };
        speaking = true;
        speechSynthesis.speak(u);
      };
      next();
    }
    function render() {
      var i = sceneAt(t), s = scenes[i], prog = (t - s.start) / s.dur;
      art.textContent = '';
      art.appendChild(draw(s.name, resolve(s.args, prog, t - s.start)));
      if (i !== idx) {
        idx = i;
        chip.textContent = (i + 1) + ' / ' + scenes.length + (s.title ? ' · ' + s.title : '');
        cap.textContent = s.say;
        [].forEach.call(chapters.children, function (li, j) { li.classList.toggle('on', j === i); });
        if (playing) speakFrom(i, 0);
      }
      cap.hidden = !cc || !s.say;
      fill.style.width = (t / total * 100) + '%';
      time.textContent = fmt(t) + ' / ' + fmt(total);
      track.setAttribute('aria-valuenow', Math.round(t)); track.setAttribute('aria-valuemax', Math.round(total));
    }
    function tick() {
      var now = performance.now(), dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      var i = sceneAt(t), end = scenes[i].start + scenes[i].dur;
      if (speaking && t + dt >= end - 0.05) t = end - 0.05; // wait for the voice to finish the scene
      else t += dt;
      if (t >= total) { t = total; setPlaying(false); render(); return; }
      render();
      timer = setTimeout(tick, 60);
    }
    function setPlaying(on) {
      playing = on;
      play.textContent = on ? '❚❚' : '▶';
      play.setAttribute('aria-label', on ? 'Pause' : 'Play');
      big.hidden = on;
      clearTimeout(timer);
      if (on) {
        if (t >= total - 0.1) { t = 0; idx = -1; }
        last = performance.now();
        if (idx === sceneAt(t)) speakFrom(idx, qi); else render();
        tick();
      } else stopVoice();
    }
    function seek(x, snap) {
      var i = sceneAt(clamp(x, 0, total - 0.01));
      t = snap || voiceOn ? scenes[i].start : clamp(x, 0, total);
      idx = -1; qi = 0; stopVoice();
      render();
    }
    play.addEventListener('click', function () { setPlaying(!playing); });
    big.addEventListener('click', function () { setPlaying(true); });
    art.addEventListener('click', function () { setPlaying(!playing); });
    track.addEventListener('click', function (e) { var r = track.getBoundingClientRect(); seek((e.clientX - r.left) / r.width * total); });
    track.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { seek(scenes[Math.min(scenes.length - 1, sceneAt(t) + 1)].start, true); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { seek(scenes[Math.max(0, sceneAt(t) - (t - scenes[sceneAt(t)].start < 1.5 ? 1 : 0))].start, true); e.preventDefault(); }
    });
    voiceBtn.addEventListener('click', function () { voiceOn = !voiceOn; voiceBtn.textContent = voiceOn ? 'Voice on' : 'Voice off'; if (voiceOn && playing) speakFrom(sceneAt(t), 0); else stopVoice(); });
    ccBtn.addEventListener('click', function () { cc = !cc; ccBtn.setAttribute('aria-pressed', String(cc)); render(); });
    fsBtn.addEventListener('click', function () { var el = document.fullscreenElement ? null : root; if (el && el.requestFullscreen) el.requestFullscreen(); else if (document.exitFullscreen) document.exitFullscreen(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden && playing) setPlaying(false); });
    window.addEventListener('pagehide', stopVoice);
    if ('speechSynthesis' in window) speechSynthesis.getVoices();
    root.setAttribute('aria-label', 'Lesson video' + (title ? ': ' + title : ''));
    render();
    return root;
  }

  // ---------- quiz questions in a lesson ----------
  // ::quiz Question text
  // - a wrong option
  // * the right option
  // ? Optional explanation, shown with the answers.
  // All ::quiz blocks on a page form one quiz: the answers show once every question has been answered.
  var quizItems = [];
  // A question is built before the lesson text is put on the page, so only drop one that was on the page and has since left it.
  function quizLive() {
    quizItems = quizItems.filter(function (q) { var on = document.body.contains(q.box); if (on) q.seen = true; return on || !q.seen; });
    return quizItems;
  }
  function quizFooter() {
    var items = quizLive();
    if (!items.length) return;
    var last = items[items.length - 1], foot = last.box.querySelector('.hhq-foot');
    items.forEach(function (q) { var f = q.box.querySelector('.hhq-foot'); if (f && q !== last) f.remove(); });
    if (!foot) { foot = h('div', 'hhq-foot'); foot.setAttribute('aria-live', 'polite'); last.box.appendChild(foot); }
    var done = items.filter(function (q) { return q.picked !== null; }).length, all = done === items.length;
    foot.textContent = '';
    if (!all) { foot.appendChild(h('p', 'hhq-note', done + ' of ' + items.length + ' answered. Answer every question to see the right answers.')); return; }
    var score = items.filter(function (q) { return q.picked === q.right; }).length;
    foot.appendChild(h('p', 'hhq-score', 'You scored ' + score + ' out of ' + items.length + '.'));
    var again = h('button', 'btn quiet', 'Try again');
    again.type = 'button';
    again.addEventListener('click', function () {
      quizLive().forEach(function (q) { q.reset(); });
      quizFooter();
      items[0].box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    foot.appendChild(again);
  }
  function quizUpdate() {
    var items = quizLive(), all = items.every(function (q) { return q.picked !== null; });
    if (all) items.forEach(function (q) { q.reveal(); });
    quizFooter();
  }
  function quiz(block) {
    var lines = String(block || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    var opts = [], right = -1, why = '';
    lines.slice(1).forEach(function (ln) {
      var mark = ln.charAt(0), text = ln.slice(1).trim();
      if (mark === '?') why = text;
      else if (mark === '*' || mark === '-') { if (mark === '*') right = opts.length; opts.push(text); }
    });
    var n = quizLive().length + 1, group = 'hhq' + n + '-' + Math.random().toString(36).slice(2, 7);
    var box = h('fieldset', 'hhq'), legend = h('legend', '', 'Question ' + n), list = h('div', 'hhq-opts'), expl = h('p', 'hhq-why');
    box.appendChild(legend);
    box.appendChild(h('p', 'hhq-q', lines[0] || ''));
    expl.hidden = true;
    var item = { box: box, picked: null, right: right, reveal: null, reset: null, seen: false }, rows = [];
    opts.forEach(function (text, i) {
      var row = h('label', 'hhq-opt'), input = document.createElement('input');
      input.type = 'radio'; input.name = group; input.value = i;
      input.addEventListener('change', function () { item.picked = i; quizUpdate(); });
      row.appendChild(input); row.appendChild(h('span', '', text));
      list.appendChild(row); rows.push({ row: row, input: input });
    });
    item.reveal = function () {
      rows.forEach(function (r, i) {
        r.input.disabled = true;
        r.row.classList.toggle('is-right', i === right);
        r.row.classList.toggle('is-wrong', i === item.picked && i !== right);
      });
      expl.textContent = (item.picked === right ? 'Correct. ' : 'Not quite. The right answer is: ' + (opts[right] || '') + '. ') + why;
      expl.className = 'hhq-why ' + (item.picked === right ? 'good' : 'bad');
      expl.hidden = false;
    };
    item.reset = function () {
      item.picked = null;
      rows.forEach(function (r) { r.input.disabled = false; r.input.checked = false; r.row.classList.remove('is-right', 'is-wrong'); });
      expl.hidden = true;
    };
    box.appendChild(list); box.appendChild(expl);
    quizItems.push(item);
    setTimeout(quizFooter, 0);
    return box;
  }

  // Splits a lesson body into its video (if any) and the rest.
  function splitBody(body) {
    var blocks = String(body || '').split(/\n\s*\n/), vid = null, rest = [];
    blocks.forEach(function (b) {
      var t = b.trim();
      if (t.indexOf('::video') === 0) vid = t.split('\n').slice(1).map(function (s) { return s.trim(); }).filter(Boolean);
      else rest.push(b);
    });
    return { video: vid, body: rest.join('\n\n') };
  }

  window.HHFig = { draw: draw, figure: figure, video: video, quiz: quiz, splitBody: splitBody, names: Object.keys(F) };
})();
