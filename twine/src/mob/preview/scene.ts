/** Viewer script: the three.js scene, compass, rig axes and one mesh per member. */
export const SCENE = `const $ = (id) => document.getElementById(id);

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

`;
