/**
 * spool - the opt-in **convenience layer**: handy, composed helpers built on
 * helix's *public* API, the middle ground between the bare compiler (helix) and
 * the opinionated framework (twine).
 *
 * Each helper is a `KitPlugin`. This barrel is **type-only**: importing it gives
 * you the contract and each plugin's result *type*, but activates **nothing** at
 * runtime. You turn helpers on by installing them - pull each from its subpath and
 * hand it to the installer:
 *
 *   import { installKit } from "spool";
 *   import { holding } from "spool/plugins/holding";
 *   import { clip } from "spool/plugins/clip";
 *   installKit([holding, clip]);
 *
 * `installKit(allPlugins)` (from "spool/plugins/all") opts into everything.
 *
 * Adding a plugin: new file under `src/plugins/`, export a `KitPlugin` whose
 * `install()` does the augmentation (build only on helix's public API - no
 * `dist/core/...`, no `new XxxNode`). Declare cross-plugin ordering with `deps`,
 * and register it in `plugins/all.ts`. See spool/CLAUDE.md.
 */

export type { KitPlugin } from "./plugin";
export { installKit } from "./kit";

// The entity-set type, for typing `dp.entitySet()` results (the runtime method is
// installed by the `entitySet` plugin). Importing this does NOT activate any
// augmentation.
export { EntitySet } from "./plugins/entity_set";

// The Paper native-ops facade, for typing `ctx.paper()` results (the runtime
// method is installed by the `native` plugin). Importing this does NOT activate
// any augmentation.
export { PaperOps } from "./plugins/native";

// The player_motion library handle, for typing `dp.playerMotion()` results (the
// runtime method is installed by the `playerMotion` plugin). Importing this does
// NOT activate any augmentation.
export type { PlayerMotion } from "./plugins/player_motion";

// The raycast handles, for typing `dp.raycast()` results (the runtime method is
// installed by the `raycast` plugin). Importing this does NOT activate any
// augmentation.
export type { RaycastRef, RaycastOptions } from "./plugins/raycast";

// The grapple/swing handle, for typing `dp.grapple()` results (the runtime method
// is installed by the `grapple` plugin, which deps on `player_motion` + `raycast`).
// Importing this does NOT activate any augmentation.
export type { Grapple, GrappleOptions } from "./plugins/grapple";

// The clip/cutscene timeline engine, for typing animation results (the runtime
// `dp.clip()`/`dp.cutscene()` methods are installed by the `clip` plugin).
// Importing these does NOT activate any augmentation.
export {
  Clip,
  Cutscene,
  TransformTrack,
  NbtTrack,
  TpTrack,
  modelTarget,
  type Track,
  type TrackMode,
  type NbtValue,
  type ModelTarget,
  type TransformMember,
  type Keyframe,
  type Ease,
} from "./plugins/clip";
