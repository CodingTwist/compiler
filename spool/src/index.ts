/**
 * spool: opt-in helpers built on helix's public API.
 *
 * This barrel only exports types; nothing is active until you install plugins:
 *
 *   import { installKit } from "spool";
 *   import { holding } from "spool/plugins/holding";
 *   import { clip } from "spool/plugins/clip";
 *   installKit([holding, clip]);
 *
 * To add a plugin, see spool/CLAUDE.md.
 */

export type { KitPlugin } from "./plugin";
export { installKit } from "./kit";

// Type for `dp.entitySet()` results. Doesn't install the plugin.
export { EntitySet } from "./plugins/entity_set";

// Type for `ctx.paper()` results. Doesn't install the plugin.
export { PaperOps } from "./plugins/native";

// Type for `dp.playerMotion()` results. Doesn't install the plugin.
export type { PlayerMotion } from "./plugins/player_motion";

// Types for `dp.raycast()` results. Doesn't install the plugin.
export type { RaycastRef, RaycastOptions, Ray, LookRay } from "./plugins/raycast";

// Types for `dp.grapple()` results. Doesn't install the plugin.
export type { Grapple, GrappleOptions } from "./plugins/grapple";

// Types for `ctx.ballistic()` results. `solveLaunch` itself needs no install.
export type {
  LaunchOptions,
  LaunchSolution,
  BallisticOptions,
  ProjectileProfile,
} from "./plugins/ballistics";

// Type for `locator(dp)` results; it needs no install.
export type { Locator } from "./plugins/locator";

// Types for `dp.probe()` results. Doesn't install the plugin.
export type { Suite, ProbeCase, ProbeOptions } from "./plugins/probe";

// Types for `dp.clip()`/`dp.cutscene()` results. Doesn't install the plugin.
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

// Types for `ctx.particleRing()` options. Doesn't install the plugin.
export type { RingOptions } from "./plugins/particles";

// Types for `rig(dp, ...)` results; it needs no install.
export type { Rig, RigOptions, Relay } from "./plugins/rig";

// Types for `defineMob(...).build(name)` results; it needs no install.
export type { Mob, MobBuilder, MobOptions, MobStates } from "./plugins/mob";

// The level type for `difficulty(dp)`; it needs no install.
export type { Difficulty } from "./plugins/difficulty";
