/** Viewer script: the keyframe editor's gizmo, picking and keyboard input. */
export const EDITOR = `// ---- keyframe editor: a draft gesture, played through the same replay as the real ones ----
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

`;
