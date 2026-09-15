/** Viewer script: replaying a gesture's pose writes and the playback controls. */
export const PLAYBACK = `let gesture = null, tick = 0, playing = true, end = 20, editing = null;
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

`;
