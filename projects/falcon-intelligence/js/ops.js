// Devices & integration, breeding, vision lab (dataset workflow), reports, administration.
import { S, $, $$, api, esc, can, toast, guard, dt, day, num, prov, hydrateImages, blobUrl, formModal, infoModal, openAuthed } from "./core.js";
import { route } from "./app.js";

const reload = () => route();
const falconOptions = async () => (await api("/falcons")).map((f) => [f.id, `${f.name} (${f.code})`]);

// --- devices ----------------------------------------------------------------------------------------
export async function devicesView(main) {
  const devs = await api("/devices");
  const g = S.meta.mass_guidance;
  main.innerHTML = `<div class="head"><div><h1>Tracking devices</h1><div class="muted">Registry, professional fit review and integration for any tracker manufacturer</div></div>
      ${can("device.write") ? `<button class="primary" id="add">Register device</button>` : ""}</div>
    <div class="note warn"><b>Animal welfare.</b> A tracker must suit the species, the individual bird's size and the intended use. Weight, balance, attachment and aerodynamic effect must be reviewed by qualified falconry and veterinary professionals.
      The platform screens device mass against the bird's last recorded weight (warning above ${(g.warn * 100).toFixed(0)}%, blocked above ${(g.block * 100).toFixed(0)}%), but a mass ratio never shows that a device is safe — every fit stays “pending” until a professional records a review.</div>
    <div class="card"><table><tr><th>Device</th><th>Protocol</th><th>Mass / size</th><th>Reports (observed)</th><th>Radio &amp; GNSS</th><th>Battery</th><th>Connectivity</th><th>Assigned to</th><th>Fit review</th><th></th></tr>
      ${devs.map((d) => { const a = d.assignment; return `<tr><td><b>${esc(d.serial)}</b><div class="small muted">${esc(d.manufacturer || "")} ${esc(d.model || "")}</div></td><td><span class="badge">${esc(d.protocol)}</span></td>
        <td>${d.mass_g ?? "—"} g<div class="small muted">${esc(d.dims_mm || "")} ${esc(d.ip_rating || "")}</div></td><td class="small">${d.observed_capabilities ? d.observed_capabilities.map(esc).join(", ") : `<span class="muted">no data yet</span>`}${d.capabilities ? `<div class="muted">declared: ${d.capabilities.length} fields</div>` : ""}</td><td class="small">${esc((d.radios || []).join(", "))}<div class="muted">${esc(d.gnss || "")}</div></td>
        <td>${d.battery_pct != null ? num(d.battery_pct, 0) + "%" : "—"}<div class="small muted">${d.battery_life_h ? "~" + d.battery_life_h + " h" : ""}</div></td>
        <td><span class="state ${{ online: "live", recent: "recent", offline: "stale" }[d.connectivity] || "unavailable"}">${esc(d.connectivity.replace("_", " "))}</span><div class="small muted">${d.last_seen ? dt(d.last_seen) : ""}</div></td>
        <td>${a ? `<a href="#/falcon/${a.falcon_id}/tracking">${esc(a.falcon_name)}</a><div class="small muted">${esc(a.attachment_method || "")}${a.mass_ratio ? ` · ${(a.mass_ratio * 100).toFixed(1)}% of body weight` : ""}</div>` : `<span class="muted">unassigned</span>`}</td>
        <td>${a ? `<span class="badge" style="color:${a.review_status === "approved" ? "var(--ok)" : "var(--warn)"}">${esc(a.review_status)}</span>${a.review_notes ? `<div class="small muted">${esc(a.review_notes)}</div>` : ""}` : ""}</td>
        <td class="nowrap">${a && a.review_status === "pending" && can("device.review") ? `<button class="sm" data-review="${a.id}">Review fit</button> ` : ""}
          ${can("device.write") ? (a ? `<button class="sm" data-end="${a.id}">Remove</button>` : `<button class="sm" data-assign="${d.id}">Assign</button>`) + ` <button class="sm" data-key="${d.id}">New ingest key</button>` : ""}</td></tr>`; }).join("")}</table></div>
    <h2 style="margin-top:22px">Integration</h2>
    <div class="card"><div class="small muted">Trackers and gateways post to <code>POST /api/ingest/&lt;serial&gt;</code> with the device key in the <code>X-Device-Key</code> header. Each protocol below is an adapter; new manufacturers are added as an adapter, or with a JSON field map and no code.</div>
      ${S.meta.adapters.map((a) => `<h3>${esc(a.key)}</h3><div>${esc(a.description)}</div><pre>${esc(JSON.stringify(a.example, null, 1))}</pre>${a.doc ? `<details><summary class="small muted">Format notes</summary><pre>${esc(a.doc)}</pre></details>` : ""}`).join("")}</div>`;
  if ($("#add")) $("#add").onclick = () => formModal("Register tracking device", [
    { name: "serial", label: "Serial number", required: true }, { name: "manufacturer", label: "Manufacturer" }, { name: "model", label: "Model" },
    { name: "protocol", label: "Protocol / adapter", type: "select", options: S.meta.adapters.map((a) => [a.key, `${a.key} — ${a.description}`]) },
    { name: "mass_g", label: "Mass including attachment (g)", type: "number", required: true, help: "Needed for welfare screening before the device can be assigned." },
    { name: "dims_mm", label: "Dimensions (mm)" }, { name: "tx_interval_s", label: "Reporting interval (s)", type: "number", value: 5 },
    { name: "battery_life_h", label: "Battery life (h)", type: "number" }, { name: "ip_rating", label: "Ingress rating" },
    { name: "field_map", label: "Field map (vendor_webhook only, JSON)", type: "textarea", placeholder: '{"ts":"data.time","lat":"data.position.latitude","lon":"data.position.longitude"}' }],
  async (v) => { if (v.field_map) v.field_map = JSON.parse(v.field_map); else delete v.field_map;
    const d = await api("/devices", { body: v }); setTimeout(() => { infoModal("Device registered", `<p>Ingest key for <b>${esc(d.serial)}</b> (shown once):</p><pre>${esc(d.ingest_key)}</pre><p class="small muted">${esc(d.ingest_key_note)}</p>`); }, 0); reload(); });
  $$("[data-key]").forEach((b) => b.onclick = guard(async () => { if (!confirm("Create a new ingest key? The old key stops working.")) return;
    const r = await api(`/devices/${b.dataset.key}/rotate-key`, { body: {} }); infoModal("New ingest key", `<pre>${esc(r.ingest_key)}</pre><p class="small muted">Shown once. Configure it in the tracker or gateway.</p>`); }));
  $$("[data-end]").forEach((b) => b.onclick = guard(async () => { if (!confirm("Record that this tracker was removed from the bird?")) return; await api(`/assignments/${b.dataset.end}/end`, { body: {} }); reload(); }));
  $$("[data-review]").forEach((b) => b.onclick = () => formModal("Professional fit review", [
    { name: "decision", label: "Decision", type: "select", options: [["approved", "Approved for this bird"], ["rejected", "Not suitable — remove"]] },
    { name: "notes", label: "What was checked (fit, balance, attachment, feather condition, flight behaviour)", type: "textarea", required: true }],
  async (v) => { await api(`/assignments/${b.dataset.review}/review`, { body: v }); toast("Review recorded"); reload(); },
  { intro: `<div class="note">Record your own in-hand assessment of this bird with this device. The platform does not assess suitability.</div>` }));
  $$("[data-assign]").forEach((b) => b.onclick = guard(async () => {
    const opts = await falconOptions(), did = b.dataset.assign;
    formModal("Assign tracker to a falcon", [{ name: "falcon_id", label: "Falcon", type: "select", options: opts },
      { name: "attachment_method", label: "Attachment method", required: true, placeholder: "tail mount, leg mount, backpack harness…" },
      { name: "acknowledge_review", label: "I confirm a qualified falconry / veterinary professional will check weight, balance and attachment on this bird before it is flown", type: "checkbox" }],
    async (v) => { const w = await api(`/devices/${did}/welfare/${v.falcon_id}`);
      if (w.status === "warning" && !confirm(w.message + "\n\nContinue and send for professional review?")) throw new Error("Assignment cancelled");
      const r = await api(`/devices/${did}/assign`, { body: v }); toast(r.welfare.message); reload(); },
    { intro: `<div class="note warn">Never assume a generic tracker or attachment is safe for a falcon. The assignment stays pending until a professional records a fit review.</div>`, submit: "Screen and assign" });
  }));
}

// --- breeding -----------------------------------------------------------------------------------------
export async function breedingView(main) {
  const pairs = await api("/breeding");
  const W = can("breeding.write");
  const link = (p) => p ? `<a href="#/falcon/${p.id}">${esc(p.name)}</a>` : `<span class="muted">not recorded</span>`;
  main.innerHTML = `<div class="head"><div><h1>Breeding &amp; lineage</h1><div class="muted">Pairs, eggs, incubation observations and chick records</div></div>${W ? `<button class="primary" id="add">New pair</button>` : ""}</div>
    ${pairs.map((p) => `<div class="card" style="margin-bottom:14px"><div class="row"><h2 class="grow">Season ${esc(p.season)} — ${link(p.sire)} × ${link(p.dam)}</h2><span class="badge">${esc(p.method || "method not recorded")}</span><span class="badge">${esc(p.facility || "")}</span>
        ${p.verified_by ? `<span class="badge" style="color:var(--ok)" title="${esc(p.verification_note || "")}">verified by ${esc(p.verified_by_name || "")}</span>` : `<span class="badge" style="color:var(--warn)">not verified</span>`}
        ${!p.verified_by && ["vet", "admin", "facility_manager"].includes(S.user.role) ? `<button class="sm" data-verify="${p.id}">Verify record</button>` : ""}
        ${W && p.dam ? `<button class="sm" data-doc="${p.id}" data-dam="${p.dam.id}">Attach document</button>` : ""}
        ${W ? `<button class="sm" data-egg="${p.id}">Add egg</button>` : ""}</div>
      ${p.documents.length ? `<div class="small">Documents: ${p.documents.map((d) => `<a href="#" data-open="${d.id}">${esc(d.filename)}</a>`).join(", ")}</div>` : ""}
      <div class="small muted">${p.summary.eggs} eggs · ${p.summary.hatched} hatched · ${p.summary.infertile} infertile ${prov("derived")}</div>
      <table><tr><th>Egg</th><th>Laid</th><th>Status</th><th>Incubation observations</th><th>Chick</th><th></th></tr>
      ${p.eggs.map((e) => `<tr><td><b>${esc(e.label)}</b></td><td>${day(e.laid_date)}</td><td><span class="badge">${esc(e.status)}</span>${e.hatch_date ? `<div class="small muted">hatched ${day(e.hatch_date)}</div>` : ""}</td>
        <td class="small">${(e.incubation_log || []).map((l) => `<div>${day(l.date)} — ${esc(l.note)}${l.mass_g ? ` · ${l.mass_g} g` : ""} <span class="muted">(${esc(l.by || "")})</span></div>`).join("") || `<span class="muted">none</span>`}</td>
        <td>${e.chick ? link(e.chick) : "—"}</td><td class="nowrap">${W ? `<button class="sm" data-log="${e.id}">Add observation</button> <button class="sm" data-st="${e.id}">Update status</button>` : ""}</td></tr>`).join("")}</table></div>`).join("") || `<div class="card muted">No breeding records.</div>`}`;
  if ($("#add")) $("#add").onclick = guard(async () => { const o = [["", "— not recorded —"], ...await falconOptions()];
    formModal("New breeding pair", [{ name: "season", label: "Season", required: true, value: new Date().getFullYear() }, { name: "sire_id", label: "Sire", type: "select", options: o }, { name: "dam_id", label: "Dam", type: "select", options: o },
      { name: "method", label: "Method", type: "select", options: ["natural", "artificial insemination"] }, { name: "facility", label: "Facility / chamber" }, { name: "notes", label: "Notes", type: "textarea" }],
    async (v) => { await api("/breeding/pairs", { body: v }); reload(); }); });
  $$("[data-verify]").forEach((b) => b.onclick = () => formModal("Verify breeding record", [{ name: "note", label: "What was checked (documents, rings, hatch records)", type: "textarea", required: true }],
    async (v) => { await api(`/breeding/pairs/${b.dataset.verify}/verify`, { body: v }); toast("Record verified"); reload(); },
    { intro: `<div class="note">Verification is a second person confirming the record against documents. It is not a genetic test, and no genetic health claim is made.</div>` }));
  $$("[data-doc]").forEach((b) => b.onclick = () => formModal("Attach document to breeding record", [{ name: "file", label: "File (PDF or image)", type: "file", required: true, accept: "application/pdf,image/*" }, { name: "note", label: "Note" }],
    async (v) => { const fd = new FormData(); fd.append("file", v.file); fd.append("kind", "document"); fd.append("category", "breeding"); fd.append("note", v.note || ""); fd.append("linked_type", "breeding_pair"); fd.append("linked_id", b.dataset.doc);
      await api(`/falcons/${b.dataset.dam}/attachments`, { body: fd }); toast("Document attached"); reload(); }));
  $$("[data-open]").forEach((a) => a.onclick = guard(async (e) => { e.preventDefault(); await openAuthed(`/attachments/${a.dataset.open}/file`); }));
  $$("[data-egg]").forEach((b) => b.onclick = () => formModal("Add egg", [{ name: "label", label: "Egg label", required: true }, { name: "laid_date", label: "Laid", type: "date" }],
    async (v) => { await api(`/breeding/pairs/${b.dataset.egg}/eggs`, { body: v }); reload(); }));
  $$("[data-log]").forEach((b) => b.onclick = () => formModal("Incubation observation", [{ name: "log_note", label: "Observation", type: "textarea", required: true }, { name: "mass_g", label: "Egg mass (g)", type: "number" }, { name: "log_date", label: "Date", type: "date" }],
    async (v) => { await api(`/eggs/${b.dataset.log}`, { method: "PATCH", body: v }); reload(); }));
  $$("[data-st]").forEach((b) => b.onclick = () => formModal("Update egg status", [{ name: "status", label: "Status", type: "select", options: ["incubating", "fertile", "infertile", "hatched", "failed"] },
    { name: "hatch_date", label: "Hatch date (if hatched)", type: "date" }, { name: "chick_name", label: "Chick name (if hatched)" }],
  async (v) => { const r = await api(`/eggs/${b.dataset.st}`, { method: "PATCH", body: v }); if (r.chick) toast(`Chick profile created: ${r.chick.name}`); reload(); },
  { intro: `<div class="small muted">Marking an egg as hatched creates a chick profile linked to both parents.</div>` }));
}

// --- vision lab ---------------------------------------------------------------------------------------
export async function visionLabView(main) {
  const d = await api("/dataset");
  const st = d.stats, W = can("dataset.write");
  main.innerHTML = `<div class="head"><div><h1>Vision lab</h1><div class="muted">Dataset collection, annotation and model readiness</div></div>${W ? `<button id="exp">Export reviewed items (COCO-style)</button>` : ""}</div>
    <div class="note warn"><b>Model status.</b> No falcon-specific detection, species or individual-identification model is enabled. General-purpose animal models are not assumed to be accurate for falcons, and no accuracy is claimed until a model is benchmarked on a held-out test split. Photo tools on each falcon's Media tab are observation aids that state their own limits.</div>
    <div class="grid g4"><div class="card stat"><b>${st.total}</b><span>images in dataset (target ${d.readiness.detection_min_images} for detection)</span></div>
      <div class="card stat"><b>${st.by_status.reviewed || 0}</b><span>annotated and independently reviewed</span></div>
      <div class="card stat"><b>${st.birds_with_10_plus_images}</b><span>birds with 10+ images (identity needs ${d.readiness.identity_min_per_bird} each)</span></div>
      <div class="card stat"><b>${st.with_consent}</b><span>with owner consent recorded</span></div></div>
    <div class="note">${esc(d.readiness.note)}</div>
    <div class="card"><h2>Annotation queue</h2>${d.items.length ? `<table><tr><th></th><th>Image</th><th>Labels</th><th>Boxes</th><th>Split</th><th>Status</th><th></th></tr>
      ${d.items.map((i) => `<tr><td><img data-att="${i.attachment_id}" style="width:72px;height:54px;object-fit:cover;border-radius:5px"></td><td>${esc(i.filename)}</td>
        <td class="small">${Object.entries(i.labels || {}).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join("<br>") || "—"}</td><td>${(i.boxes || []).length}</td><td>${esc(i.split || "—")}</td><td><span class="badge">${esc(i.status)}</span></td>
        <td class="nowrap">${W ? `<button class="sm" data-ann="${i.id}" data-att-id="${i.attachment_id}">Annotate</button> <button class="sm" data-rev="${i.id}">Approve review</button>` : ""}</td></tr>`).join("")}</table>`
    : `<div class="muted">Empty. Add consented photos from a falcon's Media tab (“Add to training dataset”).</div>`}</div>`;
  hydrateImages(main);
  if ($("#exp")) $("#exp").onclick = guard(() => openAuthed("/dataset/export", "falcon_dataset.json"));
  $$("[data-rev]").forEach((b) => b.onclick = guard(async () => { await api(`/dataset/${b.dataset.rev}`, { method: "PATCH", body: { status: "reviewed" } }); reload(); }));
  $$("[data-ann]").forEach((b) => b.onclick = guard(async () => annotate(d.items.find((i) => i.id === +b.dataset.ann))));
}

async function annotate(item) {
  const url = await blobUrl(item.attachment_id);
  let boxes = [...(item.boxes || [])];
  const root = infoModal("Annotate image", `<div class="small muted">Drag on the image to draw a box around each falcon. Boxes are stored in normalised coordinates.</div>
    <div id="annw" style="position:relative;display:inline-block;margin:8px 0;user-select:none"><img src="${url}" style="max-width:100%;display:block;border-radius:6px" draggable="false"><div id="annb"></div></div>
    <div class="grid g3"><div><label>Species</label><select id="a_sp"><option value="">—</option>${S.meta.species.map((s) => `<option ${item.labels?.species === s.common_name ? "selected" : ""}>${esc(s.common_name)}</option>`).join("")}</select></div>
      <div><label>Pose / activity</label><select id="a_pose">${["", "perched", "on fist", "in flight", "hooded", "feeding", "chick"].map((p) => `<option ${item.labels?.pose === p ? "selected" : ""}>${p}</option>`).join("")}</select></div>
      <div><label>Dataset split</label><select id="a_split">${["", "train", "val", "test"].map((p) => `<option ${item.split === p ? "selected" : ""}>${p}</option>`).join("")}</select></div></div>
    <div class="row" style="margin-top:12px"><button id="a_clear">Clear boxes</button><button class="primary" id="a_save">Save annotation</button></div>`);
  const wrap = $("#annw", root), layer = $("#annb", root);
  const paint = () => { layer.innerHTML = boxes.map((b) => `<div style="position:absolute;left:${b.x * 100}%;top:${b.y * 100}%;width:${b.w * 100}%;height:${b.h * 100}%;border:2px solid #d2a24c;background:rgba(210,162,76,.15);pointer-events:none"></div>`).join(""); };
  paint();
  let start = null;
  const rel = (e) => { const r = wrap.getBoundingClientRect(); return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]; };
  wrap.onpointerdown = (e) => { start = rel(e); wrap.setPointerCapture(e.pointerId); };
  wrap.onpointerup = (e) => { if (!start) return; const [x, y] = rel(e); const b = { x: Math.min(x, start[0]), y: Math.min(y, start[1]), w: Math.abs(x - start[0]), h: Math.abs(y - start[1]), label: "falcon" }; start = null;
    if (b.w > 0.02 && b.h > 0.02) { boxes.push(b); paint(); } };
  $("#a_clear", root).onclick = () => { boxes = []; paint(); };
  $("#a_save", root).onclick = guard(async () => { await api(`/dataset/${item.id}`, { method: "PATCH", body: { boxes, labels: { species: $("#a_sp", root).value || null, pose: $("#a_pose", root).value || null }, split: $("#a_split", root).value || undefined } });
    toast("Annotation saved — a different person must review it"); route(); });
}

// --- reports ------------------------------------------------------------------------------------------
export async function reportsView(main) {
  const fs = await api("/falcons");
  main.innerHTML = `<div class="head"><div><h1>Reports</h1><div class="muted">Printable performance and health observation reports, with every figure labelled by source</div></div></div>
    <div class="card" style="max-width:560px"><label>Falcon</label><select id="rf">${fs.map((f) => `<option value="${f.id}">${esc(f.name)} (${esc(f.code)})</option>`).join("")}</select>
      <label>Report</label><select id="rk"><option value="full">Full report — performance and health</option><option value="performance">Flight performance and training</option>${can("health.read") ? `<option value="health">Health observation</option>` : ""}</select>
      <label>Period</label><select id="rd"><option value="14">Last 14 days</option><option value="30" selected>Last 30 days</option><option value="90">Last 90 days</option></select>
      <div class="row" style="margin-top:14px"><button class="primary" id="go">Open report</button><button id="csv">Training sessions (CSV)</button></div>
      <div class="small muted" style="margin-top:8px">Reports open in a new tab; use the browser's Print → Save as PDF.</div></div>`;
  $("#go").onclick = guard(() => openAuthed(`/reports/falcon/${$("#rf").value}?kind=${$("#rk").value}&days=${$("#rd").value}`));
  $("#csv").onclick = guard(() => openAuthed(`/falcons/${$("#rf").value}/training.csv`, "training.csv"));
}

// --- administration -----------------------------------------------------------------------------------
export async function adminView(main) {
  const [users, audit] = await Promise.all([api("/users"), api("/audit")]);
  main.innerHTML = `<div class="head"><div><h1>Administration</h1><div class="muted">Species profiles, zones, users and audit trail</div></div></div>
    <div class="grid g2"><div class="card"><div class="row"><h2 class="grow">Species profiles</h2><button class="sm" id="sp">Add</button></div>
        <table><tr><th>Name</th><th>Category</th><th>Reference mass</th></tr>${S.meta.species.map((s) => `<tr title="${esc(s.notes || "")}"><td>${esc(s.common_name)}<div class="small muted"><i>${esc(s.scientific_name || "")}</i></div></td><td>${esc(s.category)}</td><td>${s.ref_mass_min_g ?? "?"}–${s.ref_mass_max_g ?? "?"} g</td></tr>`).join("")}</table>
        <div class="small muted">Reference ranges are approximate notes, never weight targets. Targets are set per bird by a veterinary professional.</div></div>
      <div class="card"><div class="row"><h2 class="grow">Geographical zones</h2><button class="sm" id="zn">Add</button></div>
        <table><tr><th>Name</th><th>Type</th><th>Centre</th><th>Radius</th><th></th></tr>${S.meta.zones.map((z) => `<tr><td>${esc(z.name)}</td><td><span class="badge">${esc(z.kind)}</span></td><td class="small">${z.lat.toFixed(4)}, ${z.lon.toFixed(4)}</td><td>${z.radius_m} m</td><td><button class="sm" data-dz="${z.id}">Delete</button></td></tr>`).join("")}</table></div></div>
    <div class="grid g2" style="margin-top:14px"><div class="card"><div class="row"><h2 class="grow">Users &amp; roles</h2><button class="sm" id="us">Add user</button></div>
        <table><tr><th>Name</th><th>Email</th><th>Role</th></tr>${users.map((u) => `<tr><td>${esc(u.name)}</td><td class="small">${esc(u.email)}</td><td><span class="badge">${esc(u.role)}</span></td></tr>`).join("")}</table></div>
      <div class="card"><h2>Audit trail</h2><div class="scroll"><table><tr><th>When</th><th>User</th><th>Action</th><th>Record</th></tr>${audit.map((a) => `<tr><td class="small nowrap">${dt(a.ts)}</td><td class="small">${esc(a.user || "—")}</td><td>${esc(a.action)}</td><td class="small">${esc(a.entity || "")} ${a.entity_id ?? ""} ${esc(a.detail || "")}</td></tr>`).join("")}</table></div></div></div>`;
  const refresh = () => { S.meta = null; reload(); };
  $("#sp").onclick = () => formModal("Add species profile", [{ name: "common_name", label: "Common name", required: true }, { name: "scientific_name", label: "Scientific name" },
    { name: "category", label: "Category", type: "select", options: ["falcon", "hybrid", "hawk", "eagle", "other"] }, { name: "ref_mass_min_g", label: "Reference mass min (g)", type: "number" }, { name: "ref_mass_max_g", label: "Reference mass max (g)", type: "number" }, { name: "notes", label: "Notes / source", type: "textarea" }],
  async (v) => { await api("/species", { body: v }); refresh(); });
  $("#zn").onclick = () => formModal("Add zone", [{ name: "name", label: "Name", required: true }, { name: "kind", label: "Type", type: "select", options: [["training", "Training location"], ["home", "Home (notify when left)"], ["notify_exit", "Notify on exit"], ["notify_enter", "Notify on entry"]] },
    { name: "lat", label: "Centre latitude", type: "number", required: true }, { name: "lon", label: "Centre longitude", type: "number", required: true }, { name: "radius_m", label: "Radius (m)", type: "number", required: true, value: 1000 }],
  async (v) => { await api("/zones", { body: v }); refresh(); });
  $$("[data-dz]").forEach((b) => b.onclick = guard(async () => { if (confirm("Delete this zone?")) { await api(`/zones/${b.dataset.dz}`, { method: "DELETE" }); refresh(); } }));
  $("#us").onclick = () => formModal("Add user", [{ name: "name", label: "Name", required: true }, { name: "email", label: "Email", type: "email", required: true }, { name: "role", label: "Role", type: "select", options: S.meta.roles },
    { name: "title", label: "Title" }, { name: "password", label: "Initial password (min 10 characters)", type: "password", required: true }],
  async (v) => { await api("/users", { body: v }); reload(); });
}
