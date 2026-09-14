// Custom mobs: a vanilla mob wearing a Display rig. `defineMob(nbt, model)` builds one;
// `writeMobPreview` renders its rig and gestures to an HTML page.
export { defineMob, MobBuilder } from "./builder";
export type { MobModuleOpts, MobModuleRef, MobPreview } from "./builder";
export { writeMobPreview } from "./preview";
export type { MobPreviewOpts } from "./preview";
