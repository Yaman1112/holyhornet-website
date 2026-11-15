// Interactive 3-D digital twin (three.js). Renders only data received from the simulation session.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const STATE_COLORS = { RELIABLE: 0x34c98a, DEGRADED: 0xf0b23a, UNCERTAIN: 0xf08a3a, LOST: 0xef5050, RECOVERING: 0x5aa9ff };

function heightColor(z) {
  const t = Math.min(Math.max(z / 3.0, 0), 1);
  const c = new THREE.Color();
  c.setHSL(0.58 - 0.45 * t, 0.55, 0.38 + 0.18 * t);
  return c;
}

function quadModel(color, wire = false) {
  const g = new THREE.Group();
  const mat = wire ? new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.55 })
    : new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.45, emissive: color, emissiveIntensity: 0.18 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.05), mat);
  g.add(body);
  for (const a of [Math.PI / 4, -Math.PI / 4]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.025, 0.02), mat);
    arm.rotation.z = a;
    g.add(arm);
  }
  for (const [x, y] of [[0.18, 0.18], [0.18, -0.18], [-0.18, 0.18], [-0.18, -0.18]]) {
    const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.008, 20), mat);
    rotor.rotation.x = Math.PI / 2;
    rotor.position.set(x, y, 0.03);
    g.add(rotor);
  }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 10), mat);
  nose.rotation.z = -Math.PI / 2;
  nose.position.set(0.12, 0, 0);
  g.add(nose);
  return g;
}

export class Twin {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050a13);
    this.scene.fog = new THREE.Fog(0x050a13, 45, 90);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 300);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(-12, -10, 16);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.target.set(10, 10, 0);
    this.controls.enableDamping = true;
    this.scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x0b1322, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(10, -20, 30);
    this.scene.add(sun);
    this.layers = { truth: true, voxels: true, cloud: true, landmarks: true, traj: true, truthTraj: false,
      ghost: false, ellipsoid: true, frustum: true, path: true, keyframes: true, places: true, lights: true };
    this.follow = false;
    this.slots = new Map();
    this.voxList = [];
    this.tool = null; // "measure" | "goal" | null
    this.measurePts = [];
    this.onGoal = null;
    this.onInfo = null;
    this._build();
    this.canvas.addEventListener("pointerdown", (e) => (this._down = [e.clientX, e.clientY]));
    this.canvas.addEventListener("pointerup", (e) => this._click(e));
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  _build() {
    const grid = new THREE.GridHelper(60, 60, 0x1b2a40, 0x111b2c);
    grid.rotation.x = Math.PI / 2;
    grid.position.set(13, 10, 0.001);
    this.scene.add(grid);
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ visible: false }));
    this.scene.add(this.ground);
    this.truthGroup = new THREE.Group();
    this.scene.add(this.truthGroup);
    this.lightGroup = new THREE.Group();
    this.scene.add(this.lightGroup);
    this.est = quadModel(0x38c8e0);
    this.scene.add(this.est);
    this.ghost = quadModel(0xffffff, true);
    this.scene.add(this.ghost);
    this.ellipsoid = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18),
      new THREE.MeshBasicMaterial({ color: 0x34c98a, transparent: true, opacity: 0.18, depthWrite: false }));
    this.scene.add(this.ellipsoid);
    this.ellEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.SphereGeometry(1, 16, 8)),
      new THREE.LineBasicMaterial({ color: 0x34c98a, transparent: true, opacity: 0.35 }));
    this.ellipsoid.add(this.ellEdge);
    const mkLine = (color, opacity = 1) => {
      const l = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
      l.frustumCulled = false;
      this.scene.add(l);
      return l;
    };
    this.trajLine = mkLine(0x38c8e0);
    this.truthLine = mkLine(0xffffff, 0.45);
    this.pathLine = mkLine(0xf0b23a);
    this.frustum = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x7fe3f2, transparent: true, opacity: 0.6 }));
    this.frustum.frustumCulled = false;
    this.scene.add(this.frustum);
    const mkPts = (color, size, opacity = 1) => {
      const p = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color, size, sizeAttenuation: true, transparent: true, opacity }));
      p.frustumCulled = false;
      this.scene.add(p);
      return p;
    };
    this.cloud = mkPts(0xff6b9a, 0.07, 0.85);
    this.landmarks = mkPts(0x6ff1ff, 0.09);
    this.kfPts = mkPts(0xb18cff, 0.16);
    this.goal = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.04, 8, 32), new THREE.MeshBasicMaterial({ color: 0xf0b23a }));
    this.scene.add(this.goal);
    this.placeLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }));
    this.placeLines.frustumCulled = false;
    this.scene.add(this.placeLines);
    this.measureLine = mkLine(0xffffff);
    this.movers = new THREE.Group();
    this.scene.add(this.movers);
  }

  mount(host) {
    if (this.canvas.parentElement !== host) host.prepend(this.canvas);
    this.host = host;
    this.resize();
  }

  resize() {
    if (!this.host) return;
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setInfo(info) {
    this.info = info;
    const vx = info.voxel;
    this.vres = vx.res;
    this.vorigin = vx.origin;
    this.vshape = vx.shape;
    // ground-truth environment (simulation): faint edges only
    this.truthGroup.clear();
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x8aa0c0, transparent: true, opacity: 0.16 });
    const fillMat = new THREE.MeshBasicMaterial({ color: 0x8aa0c0, transparent: true, opacity: 0.025, depthWrite: false });
    for (const b of info.world.boxes) {
      if (b.kind === "floor" || b.kind === "ceiling") continue;
      const s = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
      const geo = new THREE.BoxGeometry(...s);
      const m = new THREE.Mesh(geo, fillMat);
      m.position.set((b.max[0] + b.min[0]) / 2, (b.max[1] + b.min[1]) / 2, (b.max[2] + b.min[2]) / 2);
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat));
      this.truthGroup.add(m);
    }
    this.lightZones = info.world.light_zones;
    this._buildVoxelMesh(60000);
    this.setVoxels([]);
    this.fitView();
  }

  fitView() {
    const b0 = this.info?.world.bounds_min || [-8, -4, 0], b1 = this.info?.world.bounds_max || [34, 24, 3];
    const cx = (b0[0] + b1[0]) / 2, cy = (b0[1] + b1[1]) / 2;
    this.controls.target.set(cx, cy, 0);
    this.camera.position.set(cx - 6, cy - 30, 30);
    this.controls.update();
  }

  _buildVoxelMesh(cap) {
    if (this.vox) { this.scene.remove(this.vox); this.vox.geometry.dispose(); }
    const s = this.vres * 0.94;
    this.vox = new THREE.InstancedMesh(new THREE.BoxGeometry(s, s, s),
      new THREE.MeshLambertMaterial({ color: 0xffffff }), cap);
    this.vox.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.vox.count = 0;
    this.vox.frustumCulled = false;
    this.voxCap = cap;
    this.scene.add(this.vox);
  }

  _center(flat) {
    const [nx, ny, nz] = this.vshape;
    const k = flat % nz, j = Math.floor(flat / nz) % ny, i = Math.floor(flat / (ny * nz));
    return [this.vorigin[0] + (i + 0.5) * this.vres, this.vorigin[1] + (j + 0.5) * this.vres, this.vorigin[2] + (k + 0.5) * this.vres];
  }

  _setSlot(slot, flat) {
    const m = new THREE.Matrix4();
    const c = this._center(flat);
    m.makeTranslation(c[0], c[1], c[2]);
    this.vox.setMatrixAt(slot, m);
    this.vox.setColorAt(slot, heightColor(c[2]));
  }

  setVoxels(list) {
    this.slots.clear();
    this.voxList = [];
    for (const f of list) {
      if (this.voxList.length >= this.voxCap) break;
      this.slots.set(f, this.voxList.length);
      this._setSlot(this.voxList.length, f);
      this.voxList.push(f);
    }
    this.vox.count = this.voxList.length;
    this.vox.instanceMatrix.needsUpdate = true;
    if (this.vox.instanceColor) this.vox.instanceColor.needsUpdate = true;
  }

  applyVoxelDiff(added, removed) {
    for (const f of removed) {
      const slot = this.slots.get(f);
      if (slot === undefined) continue;
      const last = this.voxList.length - 1;
      const lf = this.voxList[last];
      if (slot !== last) {
        this.voxList[slot] = lf;
        this.slots.set(lf, slot);
        this._setSlot(slot, lf);
      }
      this.voxList.pop();
      this.slots.delete(f);
    }
    for (const f of added) {
      if (this.slots.has(f) || this.voxList.length >= this.voxCap) continue;
      this.slots.set(f, this.voxList.length);
      this._setSlot(this.voxList.length, f);
      this.voxList.push(f);
    }
    this.vox.count = this.voxList.length;
    this.vox.instanceMatrix.needsUpdate = true;
    if (this.vox.instanceColor) this.vox.instanceColor.needsUpdate = true;
  }

  _setLine(line, pts) {
    // a fresh geometry each time: three.js cannot grow an existing buffer
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    line.geometry.dispose();
    line.geometry = g;
  }

  _setPts(obj, arr) {
    const a = new Float32Array(arr.length * 3);
    for (let i = 0; i < arr.length; i++) { a[3 * i] = arr[i][0]; a[3 * i + 1] = arr[i][1]; a[3 * i + 2] = arr[i][2]; }
    obj.geometry.setAttribute("position", new THREE.BufferAttribute(a, 3));
    obj.geometry.computeBoundingSphere();
  }

  update(f, trajEst, trajTruth, keyframes, places) {
    if (!f) return;
    const L = this.layers;
    const e = f.est;
    this.est.position.set(...e.p);
    this.est.rotation.set(e.roll, e.pitch, e.yaw, "ZYX");
    this.ghost.visible = L.ghost;
    this.ghost.position.set(...f.truth.p);
    this.ghost.rotation.set(f.truth.roll, f.truth.pitch, f.truth.yaw, "ZYX");
    // uncertainty ellipsoid (2-sigma) from the global position covariance
    this.ellipsoid.visible = L.ellipsoid;
    if (L.ellipsoid) {
      const C = e.cov;
      const { vals, vecs } = eigSym3(C);
      const s = vals.map((v) => Math.max(2 * Math.sqrt(Math.max(v, 0)), 0.04));
      const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...vecs[0]), new THREE.Vector3(...vecs[1]), new THREE.Vector3(...vecs[2]));
      this.ellipsoid.position.set(...e.p);
      this.ellipsoid.quaternion.setFromRotationMatrix(m);
      this.ellipsoid.scale.set(s[0], s[1], s[2]);
      const col = STATE_COLORS[f.integrity.state] || 0x34c98a;
      this.ellipsoid.material.color.setHex(col);
      this.ellEdge.material.color.setHex(col);
    }
    this.truthGroup.visible = L.truth;
    this.vox.visible = L.voxels;
    this.cloud.visible = L.cloud;
    this.landmarks.visible = L.landmarks;
    if (L.cloud) this._setPts(this.cloud, f.cloud || []);
    if (L.landmarks) this._setPts(this.landmarks, f.landmarks || []);
    this.trajLine.visible = L.traj;
    if (L.traj && trajEst) this._setLine(this.trajLine, trajEst.map((p) => new THREE.Vector3(...p)));
    this.truthLine.visible = L.truthTraj;
    if (L.truthTraj && trajTruth) this._setLine(this.truthLine, trajTruth.map((p) => new THREE.Vector3(...p)));
    this.pathLine.visible = L.path;
    const path = f.path || [];
    if (L.path) this._setLine(this.pathLine, path.map((p) => new THREE.Vector3(p[0], p[1], p[2] + 0.02)));
    this.goal.visible = !!f.goal && L.path;
    if (f.goal) { this.goal.position.set(...f.goal); this.goal.rotation.set(0, 0, 0); }
    // camera frustum (from estimated pose)
    this.frustum.visible = L.frustum;
    if (L.frustum && this.info) this._frustum(f);
    this.kfPts.visible = L.keyframes;
    if (keyframes && L.keyframes) this._setPts(this.kfPts, keyframes.map((k) => k.p));
    this.placeLines.visible = L.places;
    if (places && L.places) this._places(places);
    // lighting zones (simulation environment state)
    this.lightGroup.clear();
    if (L.lights && this.lightZones && f.lights) {
      for (const z of this.lightZones) {
        const lvl = f.lights[z.name];
        if (lvl === undefined || lvl >= 0.9 || z.name === "building") continue;
        const s = [z.max[0] - z.min[0], z.max[1] - z.min[1], 3.0];
        const m = new THREE.Mesh(new THREE.BoxGeometry(...s), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 * (1 - lvl), depthWrite: false }));
        m.position.set((z.max[0] + z.min[0]) / 2, (z.max[1] + z.min[1]) / 2, 1.5);
        this.lightGroup.add(m);
      }
    }
    this.movers.clear();
    for (const mv of f.movers || []) {
      const s = [mv[3] - mv[0], mv[4] - mv[1], mv[5] - mv[2]];
      const m = new THREE.Mesh(new THREE.BoxGeometry(...s), new THREE.MeshBasicMaterial({ color: 0xf08a3a, transparent: true, opacity: 0.5 }));
      m.position.set((mv[3] + mv[0]) / 2, (mv[4] + mv[1]) / 2, (mv[5] + mv[2]) / 2);
      this.movers.add(m);
    }
    if (this.follow) {
      const d = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
      this.controls.target.set(...e.p);
      this.camera.position.copy(this.controls.target).add(d);
    }
  }

  _frustum(f) {
    const c = this.info.camera;
    const e = f.est;
    const R = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(e.roll, e.pitch, e.yaw, "ZYX"));
    const Rbc = c.R_bc;
    const hx = Math.tan((c.hfov_deg * Math.PI / 180) / 2), hy = Math.tan((c.vfov_deg * Math.PI / 180) / 2);
    const d = 2.5;
    const corners = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]].map(([x, y]) => {
      const cam = [x * d, y * d, d];
      const b = [Rbc[0][0] * cam[0] + Rbc[0][1] * cam[1] + Rbc[0][2] * cam[2] + c.t_bc[0],
        Rbc[1][0] * cam[0] + Rbc[1][1] * cam[1] + Rbc[1][2] * cam[2] + c.t_bc[1],
        Rbc[2][0] * cam[0] + Rbc[2][1] * cam[1] + Rbc[2][2] * cam[2] + c.t_bc[2]];
      return new THREE.Vector3(...b).applyMatrix4(R).add(new THREE.Vector3(...e.p));
    });
    const o = new THREE.Vector3(...c.t_bc).applyMatrix4(R).add(new THREE.Vector3(...e.p));
    const pts = [];
    for (let i = 0; i < 4; i++) { pts.push(o, corners[i], corners[i], corners[(i + 1) % 4]); }
    this._setLine(this.frustum, pts);
  }

  _places(places) {
    const pos = [], col = [];
    for (const p of places.slice(-30)) {
      pos.push(...p.p, ...p.kf_p);
      const c = p.accepted ? [0.2, 0.85, 0.55] : [0.95, 0.35, 0.35];
      col.push(...c, ...c);
    }
    this.placeLines.geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    this.placeLines.geometry.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  }

  _click(e) {
    if (!this._down || Math.hypot(e.clientX - this._down[0], e.clientY - this._down[1]) > 4) return;
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, this.camera);
    if (this.tool === "goal") {
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
      const hit = new THREE.Vector3();
      if (rc.ray.intersectPlane(plane, hit) && this.onGoal) this.onGoal([hit.x, hit.y]);
      return;
    }
    const hits = this.vox.visible ? rc.intersectObject(this.vox) : [];
    if (!hits.length) return;
    const p = hits[0].point;
    if (this.tool === "measure") {
      this.measurePts.push(p.clone());
      if (this.measurePts.length > 2) this.measurePts = [p.clone()];
      this._setLine(this.measureLine, this.measurePts);
      if (this.measurePts.length === 2 && this.onInfo) {
        const d = this.measurePts[0].distanceTo(this.measurePts[1]);
        this.onInfo(`Distance between selected map points: ${d.toFixed(2)} m (map frame, voxel ${this.vres} m)`);
      } else if (this.onInfo) this.onInfo("Measure: select a second mapped point");
    } else if (this.onInfo) {
      const f = this.voxList[hits[0].instanceId];
      const c = this._center(f);
      this.onInfo(`Occupied voxel at (${c[0].toFixed(2)}, ${c[1].toFixed(2)}, ${c[2].toFixed(2)}) m · height ${c[2].toFixed(2)} m`);
    }
  }

  _loop() {
    requestAnimationFrame(this._loop);
    this.renderNow();
  }

  renderNow() {
    if (!this.host || !this.host.isConnected || this.host.offsetParent === null) return;
    if (this.canvas.width !== Math.floor(this.host.clientWidth * this.renderer.getPixelRatio())) this.resize();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

// Jacobi eigen-decomposition for a symmetric 3x3 matrix (rows of vecs are eigenvectors)
export function eigSym3(A) {
  const a = A.map((r) => r.slice());
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 12; sweep++) {
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(a[p][q]) < 1e-12) continue;
      const th = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]);
      const c = Math.cos(th), s = Math.sin(th);
      for (let k = 0; k < 3; k++) {
        const akp = a[k][p], akq = a[k][q];
        a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p][k], aqk = a[q][k];
        a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < 3; k++) {
        const vkp = V[k][p], vkq = V[k][q];
        V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq;
      }
    }
  }
  const vals = [a[0][0], a[1][1], a[2][2]];
  const vecs = [0, 1, 2].map((i) => [V[0][i], V[1][i], V[2][i]]);
  return { vals, vecs };
}
