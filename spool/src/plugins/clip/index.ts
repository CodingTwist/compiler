/**
 * The `clip` plugin and the clip/cutscene timeline **engine** it installs.
 *
 * The engine is a generic animation layer over the helix public API: a
 * {@link Clip} is a named timeline of {@link Track}s (display transforms,
 * arbitrary NBT paths, teleport paths) plus timeline events; a {@link Cutscene}
 * composes clips on a shared timeline. It is pure animation - world tricks like
 * block↔display swapping live with the app that needs them, not here.
 *
 * The KitPlugin at the bottom installs the engine onto `dp` as `dp.clip()` /
 * `dp.cutscene()`. The rest of this folder is the engine's private
 * implementation; consumers only touch what this barrel re-exports.
 */

import { Datapack } from "helix";
import type { DisplayValue } from "helix";
import type { KitPlugin } from "../../plugin";
import { Clip } from "./clip";
import { Cutscene } from "./cutscene";

// --- Engine public surface -------------------------------------------------
export { Clip } from "./clip";
export { Cutscene } from "./cutscene";
export {
  TransformTrack,
  NbtTrack,
  TpTrack,
  type Track,
  type TrackMode,
  type NbtValue,
} from "./track";
export { modelTarget, type ModelTarget, type TransformMember } from "./targets";
export {
  type Keyframe,
  type Ease,
  lerp,
  lerpVec3,
  sample,
  sampleScalar,
  sampleVec3,
} from "./value";
export { secondsToTicks } from "./time";

// --- The plugin ------------------------------------------------------------
// Importing this module surfaces `dp.clip()`/`dp.cutscene()` to the type-checker;
// `install()` wires them at runtime.
declare module "helix" {
  interface Datapack {
    /**
     * Start a {@link Clip}: a named animation timeline whose primary track is the
     * given display model. Chain motion (`.move`/`.spin`/`.scaleTo`/`.rotateTo`),
     * add more tracks (`.track`/`.nbt`/`.tp`) and events (`.at`), then drive it
     * with `.play`/`.reverse` (one-shot) or `.loop`/`.start`/`.stop` (continuous).
     */
    clip(model: DisplayValue): Clip;
    /**
     * Start a {@link Cutscene}: compose clips on one shared timeline (`.add`,
     * `.camera`, `.at`) and `.play` the whole sequence from one call.
     */
    cutscene(name: string): Cutscene;
  }
}

export const clip: KitPlugin = {
  name: "clip",
  install() {
    Datapack.prototype.clip = function (this: Datapack, model: DisplayValue): Clip {
      return new Clip(this, model.getName(), model);
    };
    Datapack.prototype.cutscene = function (this: Datapack, name: string): Cutscene {
      return new Cutscene(this, name);
    };
  },
};
