// Display groups: `Display(block).add(...).named("cog")`, summoned as one root with passengers.
//
// Each member is a block or item display; an optional `interaction` hitbox rides the root.
export { Display, DisplayValue } from "./value";
export { DisplayBuilder } from "./builder";
export { displayPose } from "./nbt";
export type {
  DisplayChild,
  DisplayContent,
  EntityCondition,
  Quat,
  Transform,
  Vec3,
} from "./types";
