import { execFileSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import type { MobModuleRef, MobPreview } from "./mob";

export interface MobPreviewOpts {
  /**
   * A vanilla client jar to take real textures from. Without one, members render as flat
   * colour.
   */
  clientJar?: string;
}

/**
 * Writes an HTML page that renders a mob's rig and plays its gestures, using the game's
 * transform maths. Open it in a browser.
 */
export function writeMobPreview(file: string, mob: MobModuleRef, opts: MobPreviewOpts = {}): void {
  const data = mob.preview();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, page(mob.metadata.name, data, textures(data, opts.clientJar)));
}

function textures(data: MobPreview, jar?: string): Record<string, string> {
  if (!jar) return {};
  const out: Record<string, string> = {};
  for (const { kind, id } of data.members) {
    const [ns, path] = id.includes(":") ? id.split(":") : ["minecraft", id];
    try {
      // ponytail: only textures named after the id; resource-pack models and per-face
      // blocks
      // render as flat colour.
      const png = execFileSync("unzip", ["-p", jar, `assets/${ns}/textures/${kind}/${path}.png`], {
        stdio: ["ignore", "pipe", "ignore"],
      });
      if (png.length) out[id] = `data:image/png;base64,${png.toString("base64")}`;
    } catch {
      // Missing entry - flat colour.
    }
  }
  return out;
}

const page = (name: string, data: MobPreview, tex: Record<string, string>) => `<!doctype html>
<meta charset="utf-8">
<title>${name} - rig preview</title>
<style>
  body { margin: 0; font: 13px system-ui, sans-serif; background: #1d1f24; color: #ddd; overflow: hidden; }
  #ui { position: fixed; top: 8px; left: 8px; background: #000a; padding: 10px; border-radius: 6px; display: grid; gap: 6px; width: 300px; }
  #ui label { display: flex; gap: 6px; align-items: center; justify-content: space-between; }
  #ui input[type=range] { flex: 1; }
  #ui details { border-top: 1px solid #444; padding-top: 6px; }
  #ui textarea { width: 100%; box-sizing: border-box; height: 110px; font: 11px monospace; background: #111; color: #cfc; }
  #keys button.sel { outline: 2px solid #fd4; }
  #legend { position: fixed; bottom: 8px; left: 8px; background: #000a; padding: 8px 10px; border-radius: 6px; line-height: 1.5; }
  b.x { color: #f55 } b.y { color: #5f5 } b.z { color: #59f } b.p { color: #fd4 }
</style>
<div id="ui">
  <strong>${name}</strong>
  <label>gesture <select id="gesture"><option value="">(rest)</option></select></label>
  <label><button id="play">pause</button> speed <input id="speed" type="range" min="0.05" max="2" step="0.05" value="1"></label>
  <label>tick <input id="tick" type="range" min="0" step="0.05" value="0"> <span id="tickOut">0</span></label>
  <label>mob yaw <input id="yaw" type="range" min="-180" max="180" step="5" value="0"> <span id="yawOut">0° (south)</span></label>
  <label>show axes <input id="axes" type="checkbox" checked></label>
  <div id="writes"></div>
  <details id="editor">
    <summary>keyframe editor</summary>
    <small>Click a member to pose it. <b>R</b> rotate · <b>G</b> move pivot · <b>Esc</b> done. Gizmo axes are the rig's.</small>
    <p style="margin:4px 0"><button id="copy">edit copy of this gesture</button> <button id="blank">blank</button></p>
    <div id="draft" hidden>
      <label>name <input id="dname" value="draft"></label>
      <div id="dmembers"></div>
      <label>gizmo <select id="mode"><option value="rotate">rotate step</option><option value="translate">move pivot</option></select>
        snap <input id="snap" type="checkbox" checked></label>
      <label>rise <input id="rise" type="number" min="0" style="width:4em"> linger <input id="linger" type="number" min="0" style="width:4em"> fall <input id="fall" type="number" min="0" style="width:4em"></label>
      <div id="keys"></div>
      <textarea id="code" readonly></textarea>
    </div>
  </details>
</div>
<div id="legend">
  Rig-local axes turn with the mob:<br>
  <b class="z">+Z</b> = where it faces (yaw 0 = south) &nbsp; <b class="x">+X</b> = its <em>left</em> &nbsp; <b class="y">+Y</b> = up<br>
  <b class="p">●</b> gesture pivot. Grid is the rig origin (the mount point), 1 block cells. Camera starts in front of the mob.
</div>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"}}</script>
<script type="module">
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
const DATA = ${JSON.stringify(data)};
const TEX = ${JSON.stringify(tex)};
const $ = (id) => document.getElementById(id);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d1f24);
const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200);
camera.position.set(1.5, 1.5, 4);
const controls = new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.GridHelper(8, 8, 0x666666, 0x333333));

function label(text, color, pos, size = 0.35) {
  const c = document.createElement("canvas"); c.width = 256; c.height = 64;
  const g = c.getContext("2d"); g.fillStyle = color; g.font = "bold 40px sans-serif"; g.textAlign = "center"; g.fillText(text, 128, 46);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  s.scale.set(size * 4, size, 1); s.position.copy(pos); return s;
}
// World compass: fixed, the mob turns under it.
for (const [t, p] of [["N", [0, 0, -4.4]], ["S", [0, 0, 4.4]], ["E", [4.4, 0, 0]], ["W", [-4.4, 0, 0]]]) scene.add(label(t, "#888", new THREE.Vector3(...p)));

// The display's own frame: the entity's yaw, exactly as DisplayRenderer.calculateOrientation.
const rig = new THREE.Group();
scene.add(rig);
const axes = new THREE.Group();
for (const [dir, color, text] of [[[1, 0, 0], "#f55", "+X left"], [[0, 1, 0], "#5f5", "+Y"], [[0, 0, 1], "#59f", "+Z forward"]]) {
  const v = new THREE.Vector3(...dir);
  axes.add(new THREE.ArrowHelper(v, new THREE.Vector3(), 1.5, color, 0.15, 0.08));
  axes.add(label(text, color, v.clone().multiplyScalar(1.8), 0.25));
}
rig.add(axes);
const pivot = new THREE.Mesh(new THREE.SphereGeometry(0.05), new THREE.MeshBasicMaterial({ color: 0xffdd44, depthTest: false }));
pivot.renderOrder = 1;
rig.add(pivot);

const loader = new THREE.TextureLoader();
function material(id) {
  if (!TEX[id]) return new THREE.MeshBasicMaterial({ color: 0xaa44aa, side: THREE.DoubleSide });
  const map = loader.load(TEX[id]);
  map.magFilter = THREE.NearestFilter; map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide, alphaTest: 0.1 });
}
const nodes = DATA.members.map((m) => {
  const node = new THREE.Group();
  node.matrixAutoUpdate = false;
  let mesh;
  if (m.kind === "item") {
    // ItemDisplayRenderer spins 180° about Y; a flat item sprite then faces -Z at rest.
    mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material(m.id));
    mesh.rotation.y = Math.PI;
  } else {
    // A block model spans 0..1 from the display's origin corner.
    mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material(m.id));
    mesh.position.set(0.5, 0.5, 0.5);
  }
  node.add(mesh);
  rig.add(node);
  return node;
});

const tr = (t) => ({
  t: new THREE.Vector3(...(t.translation ?? [0, 0, 0])),
  l: new THREE.Quaternion(...(t.leftRotation ?? [0, 0, 0, 1])),
  s: new THREE.Vector3(...(t.scale ?? [1, 1, 1])),
  r: new THREE.Quaternion(...(t.rightRotation ?? [0, 0, 0, 1])),
});
const lerpTr = (a, b, u) => ({
  t: a.t.clone().lerp(b.t, u), s: a.s.clone().lerp(b.s, u),
  l: a.l.clone().slerp(b.l, u), r: a.r.clone().slerp(b.r, u),
});
const rest = DATA.members.map((m) => tr(m.transform));

// Replay every write up to \`tick\`: each starts from wherever the previous interpolation had got to.
function poseAt(g, tick) {
  const state = rest.map((r) => ({ from: r, to: r, start: 0, dur: 0 }));
  const valueAt = (s, t) => (s.dur <= 0 || t >= s.start + s.dur ? s.to : lerpTr(s.from, s.to, Math.max(0, (t - s.start) / s.dur)));
  for (const w of g ? g.writes : []) {
    if (w.tick > tick) break;
    for (const [i, p] of Object.entries(w.poses)) state[i] = { from: valueAt(state[i], w.tick), to: tr(p), start: w.tick, dur: w.duration };
  }
  return state.map((s) => valueAt(s, tick));
}
function apply(pose) {
  pose.forEach((p, i) => {
    const m = nodes[i].matrix.compose(p.t, p.l, p.s);
    m.multiply(new THREE.Matrix4().makeRotationFromQuaternion(p.r));
    nodes[i].matrixWorldNeedsUpdate = true;
  });
}

let gesture = null, tick = 0, playing = true, end = 20, editing = null;
for (const g of DATA.gestures) $("gesture").add(new Option(g.name, g.name));
function pick(name) { setGesture(DATA.gestures.find((g) => g.name === name) ?? null); }
function setGesture(g) {
  gesture = g;
  const last = gesture?.writes.at(-1);
  end = last ? last.tick + last.duration + 10 : 20;
  $("tick").max = end; tick = Math.min(tick, end);
  pivot.visible = !!gesture;
  if (gesture) pivot.position.set(...gesture.pivot);
  $("writes").innerHTML = gesture
    ? "<small>writes (tick → interp): " + gesture.writes.map((w) => w.tick + "→" + w.duration).join(", ") + "</small>"
    : "";
}
$("play").onclick = () => { playing = !playing; selectKey(null); $("play").textContent = playing ? "pause" : "play"; };
$("tick").oninput = (e) => { selectKey(null); tick = +e.target.value; playing = false; $("play").textContent = "play"; };
$("axes").onchange = (e) => (axes.visible = e.target.checked);
const facing = (y) => ["south", "west", "north", "east"][Math.round((((y % 360) + 360) % 360) / 90) % 4];
$("yaw").oninput = (e) => {
  const yaw = +e.target.value;
  rig.quaternion.setFromEuler(new THREE.Euler(0, -yaw * Math.PI / 180, 0, "YXZ"));
  $("yawOut").textContent = yaw + "° (" + facing(yaw) + ")";
};
if (DATA.gestures.length) { $("gesture").value = DATA.gestures[0].name; }
pick($("gesture").value);

// ---- keyframe editor: a draft gesture, played through the same replay as the real ones ----
let draft = null;
const gizmo = new TransformControls(camera, renderer.domElement);
gizmo.addEventListener("dragging-changed", (e) => (controls.enabled = !e.value));
scene.add(gizmo.getHelper());
const handle = new THREE.Group();
rig.add(handle);

// Mirrors raise() in mob.ts: orbit the translation about the pivot, compose q (then tilt) onto left.
function raise(rest, pivot, q, tilt) {
  const Q = new THREE.Quaternion(...q), P = new THREE.Vector3(...pivot);
  const t = new THREE.Vector3(...(rest.translation ?? [0, 0, 0])).sub(P).applyQuaternion(Q).add(P);
  const l = Q.clone();
  if (tilt) l.multiply(new THREE.Quaternion(...tilt));
  l.multiply(new THREE.Quaternion(...(rest.leftRotation ?? [0, 0, 0, 1])));
  return { ...rest, translation: t.toArray(), leftRotation: l.toArray() };
}
// Mirrors poseSchedule() in mob.ts.
function draftGesture() {
  const T = DATA.tickEvery, n = draft.steps.length, hold = Math.max(0, draft.rise - 1), linger = draft.linger;
  const sched = [
    { poll: 0, q: draft.steps[0], duration: draft.rise },
    ...draft.steps.slice(1).map((q, k) => ({ poll: hold + k + 1, q, duration: T })),
    { poll: n > 1 || linger ? hold + n + linger : 1, q: null, duration: draft.fall },
  ];
  return {
    name: draft.name, pivot: draft.pivot,
    writes: sched.map((w) => ({
      tick: w.poll * T, duration: w.duration,
      poses: Object.fromEntries(draft.members.map((i) => [i, w.q ? raise(DATA.members[i].transform, draft.pivot, w.q, draft.tilt) : DATA.members[i].transform])),
    })),
  };
}
function keyPose(k) {
  const w = gesture.writes[k];
  return rest.map((r, i) => (w.poses[i] ? tr(w.poses[i]) : r));
}
function selectKey(k) {
  editing = draft ? k : null;
  if (editing === null) return gizmo.detach(), renderKeys();
  playing = false; $("play").textContent = "play";
  handle.position.set(...draft.pivot);
  handle.quaternion.identity();
  gizmo.attach(handle);
  renderKeys();
}
// The handle sits at identity inside the rig, so the gizmo's local axes are the rig's own
// (they turn with the mob's yaw). Each drag is a delta laid on top of the step it started from.
gizmo.setSpace("local");
let dragFrom = null;
gizmo.addEventListener("mouseDown", () => (dragFrom = new THREE.Quaternion(...draft.steps[editing])));
gizmo.addEventListener("mouseUp", () => { dragFrom = null; handle.quaternion.identity(); });
gizmo.addEventListener("objectChange", () => {
  if (!dragFrom) return;
  if (gizmo.mode === "rotate") draft.steps[editing] = handle.quaternion.clone().multiply(dragFrom).toArray();
  else draft.pivot = handle.position.toArray();
  refresh();
});
const setMode = (m) => { gizmo.setMode(m); $("mode").value = m; };

// Click a member to pose it: starts a draft if there isn't one, and moves it with the rest.
const ray = new THREE.Raycaster();
let downAt = null;
renderer.domElement.addEventListener("pointerdown", (e) => (downAt = gizmo.axis ? null : [e.clientX, e.clientY]));
renderer.domElement.addEventListener("pointerup", (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4) return;
  ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
  const hit = ray.intersectObjects(nodes, true)[0];
  if (!hit) return;
  const i = nodes.indexOf(hit.object.parent);
  $("editor").open = true;
  if (!draft) return startDraft(null, i);
  const box = $("dmembers").querySelector('[data-i="' + i + '"]');
  if (!box.checked) { box.checked = true; box.onchange(); }
  if (editing === null) selectKey(0);
});
addEventListener("keydown", (e) => {
  if (!draft || e.target.closest("input, textarea, select")) return;
  if (e.key === "r") setMode("rotate");
  else if (e.key === "g") setMode("translate");
  else if (e.key === "Escape") selectKey(null);
});
const applySnap = () => {
  const on = $("snap").checked;
  gizmo.setRotationSnap(on ? Math.PI / 12 : null);
  gizmo.setTranslationSnap(on ? 1 / 16 : null);
};
$("snap").onchange = applySnap; applySnap();
setMode("rotate");
$("mode").onchange = (e) => setMode(e.target.value);

function startDraft(src, member = 0) {
  draft = src
    ? { name: src.name, members: [...src.members], pivot: [...src.pivot], steps: src.steps.map((q) => [...q]), tilt: src.tilt, rise: src.rise, linger: src.linger, fall: src.fall }
    : { name: "draft", members: [member], pivot: [...DATA.offset], steps: [[0, 0, 0, 1]], tilt: undefined, rise: 0, linger: 0, fall: 4 };
  $("draft").hidden = false;
  $("dname").value = draft.name; $("rise").value = draft.rise; $("linger").value = draft.linger; $("fall").value = draft.fall;
  $("dmembers").innerHTML = DATA.members.map((m, i) =>
    '<label><span>' + i + ": " + m.kind + " " + m.id + '</span><input type="checkbox" data-i="' + i + '"' + (draft.members.includes(i) ? " checked" : "") + "></label>").join("");
  for (const box of $("dmembers").querySelectorAll("input")) box.onchange = () => {
    draft.members = [...$("dmembers").querySelectorAll("input:checked")].map((b) => +b.dataset.i);
    refresh();
  };
  if (![...$("gesture").options].some((o) => o.value === "(draft)")) $("gesture").add(new Option("(draft)", "(draft)"));
  $("gesture").value = "(draft)";
  refresh(); selectKey(0);
}
$("copy").onclick = () => startDraft(gesture && gesture !== draft && DATA.gestures.find((g) => g.name === gesture.name));
$("blank").onclick = () => startDraft(null);
$("gesture").onchange = (e) => (e.target.value === "(draft)" && draft ? refresh() : (selectKey(null), pick(e.target.value)));
$("dname").oninput = (e) => { draft.name = e.target.value; refresh(); };
$("rise").oninput = (e) => { draft.rise = Math.max(0, +e.target.value); refresh(); };
$("linger").oninput = (e) => { draft.linger = Math.max(0, +e.target.value); refresh(); };
$("fall").oninput = (e) => { draft.fall = Math.max(0, +e.target.value); refresh(); };

function renderKeys() {
  if (!draft) return;
  $("keys").innerHTML = "steps: " + draft.steps.map((_, k) => '<button data-k="' + k + '"' + (k === editing ? ' class="sel"' : "") + ">" + k + "</button>").join(" ")
    + ' <button id="addKey">+ step</button> <button id="delKey">− step</button>';
  for (const b of $("keys").querySelectorAll("[data-k]")) b.onclick = () => selectKey(+b.dataset.k);
  $("addKey").onclick = () => { const k = (editing ?? draft.steps.length - 1) + 1; draft.steps.splice(k, 0, [...draft.steps[k - 1]]); refresh(); selectKey(k); };
  $("delKey").onclick = () => { if (draft.steps.length < 2) return; draft.steps.splice(editing ?? draft.steps.length - 1, 1); refresh(); selectKey(Math.min(editing ?? 0, draft.steps.length - 1)); };
}
function refresh() {
  if ($("gesture").value === "(draft)") setGesture(draftGesture());
  $("code").value = gestureSource(draft);
  renderKeys();
}

const num = (v) => +v.toFixed(4);
// A single-axis rotation reads back as quat("x", deg); anything else is a raw [x, y, z, w].
function quatSource(q) {
  const [x, y, z, w] = q, len = Math.hypot(x, y, z);
  if (len < 1e-6) return 'quat("x", 0)';
  const deg = (2 * Math.atan2(len, w) * 180) / Math.PI;
  for (const [axis, c] of [["x", x], ["y", y], ["z", z]])
    if (Math.abs(Math.abs(c) - len) < 1e-4) return 'quat("' + axis + '", ' + num(Math.sign(c) * (deg > 180 ? deg - 360 : deg)) + ")";
  return "[" + q.map(num).join(", ") + "]";
}
function gestureSource(d) {
  const lines = [
    "members: [" + d.members.join(", ") + "],",
    "pivot: [" + d.pivot.map((v, i) => num(v - DATA.offset[i])).join(", ") + "],",
    "rotate: " + (d.steps.length === 1 ? quatSource(d.steps[0]) : "[\\n    " + d.steps.map(quatSource).join(",\\n    ") + ",\\n  ]") + ",",
  ];
  if (d.tilt) lines.push("tilt: [" + d.tilt.map(num).join(", ") + "],");
  if (d.rise) lines.push("rise: " + d.rise + ",");
  if (d.linger) lines.push("linger: " + d.linger + ",");
  if (d.fall !== 4) lines.push("fall: " + d.fall + ",");
  return '.gesture("' + d.name + '", {\\n  ' + lines.join("\\n  ") + "\\n  // keep your cooldown / when / onFire\\n})";
}

let last = performance.now();
renderer.setAnimationLoop((now) => {
  const w = innerWidth, h = innerHeight;
  if (renderer.domElement.width !== w * devicePixelRatio) { renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  if (playing) { tick = (tick + ((now - last) / 50) * +$("speed").value) % end; $("tick").value = tick; }
  last = now;
  $("tickOut").textContent = tick.toFixed(1);
  apply(editing !== null ? keyPose(editing) : poseAt(gesture, tick));
  controls.update();
  renderer.render(scene, camera);
});
</script>
`;
