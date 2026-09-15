/** Viewer script: the draft gesture, its step buttons and the generated `.gesture(...)` source. */
export const DRAFT = `function startDraft(src, member = 0) {
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

`;
