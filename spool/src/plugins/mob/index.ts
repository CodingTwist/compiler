/**
 * The `mob` plugin: a vanilla mob wearing a display-entity rig, with gestures and states.
 *
 *   difficulty(dp);                              // only if it uses onDifficulty/byDifficulty
 *   const mob = defineMob(Husk({ ... }), model).gesture("swing", { ... }).build("sentinel");
 *   mob.register(dp);
 *   // then call mob.wake once a second, and mob.tick(ctx) every `tickEvery` (default 2) ticks
 *   writeMobPreview("out/sentinel.html", mob);     // renders the rig and gestures to a page
 *
 * The model is a `rig` (see `spool/plugins/rig`) riding the mob.
 *
 * twine's `defineMob(...).toModule(name)` does the registering and scheduling for you.
 */
export { defineMob, MobBuilder } from "./builder";
export { Mob, type MobFn, type Relay } from "./emit";
export type { Gesture } from "./gesture";
export type { MobOptions, MobDifficulty, MobState, MobStates, MobTick } from "./types";
export type { MobPreview } from "./preview/rig";
export { writeMobPreview, type MobPreviewOpts } from "./preview";
