import type { MobPreview } from "./rig";
import { DRAFT } from "./draft";
import { EDITOR } from "./editor";
import { LOOP } from "./loop";
import { PLAYBACK } from "./playback";
import { SCENE } from "./scene";

/** The standalone rig viewer page for one mob, with its data and textures inlined. */
export const page = (
  name: string,
  data: MobPreview,
  tex: Record<string, string>,
) => `<!doctype html>
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
${SCENE}${PLAYBACK}${EDITOR}${DRAFT}${LOOP}</script>
`;
