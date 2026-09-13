/**
 * The `clip` plugin: installs `dp.clip()` and `dp.cutscene()`.
 *
 * Pure animation. World tricks like block/display swapping belong in the app.
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
// Declares `dp.clip()`/`dp.cutscene()` for the type checker; `install()` adds them at
// runtime.
declare module "helix" {
  interface Datapack {
    /**
     * Starts a {@link Clip} for a display model.
     *
     * Chain motion (`.move`/`.spin`/`.scaleTo`/`.rotateTo`), tracks (`.track`/`.nbt`/`.tp`)
     * and
     * events (`.at`), then run it with `.play`/`.reverse` or `.loop`/`.start`/`.stop`.
     */
    clip(model: DisplayValue): Clip;
    /**
     * Starts a {@link Cutscene}: clips on one timeline (`.add`, `.camera`, `.at`), played
     * with `.play`.
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
