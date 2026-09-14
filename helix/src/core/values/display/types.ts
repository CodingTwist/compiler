// Shapes of a display group: members, transforms and spawn conditions.
import type { Selector } from "../../frontend/nodes/selector";
import { BlockValue } from "../block";
import type { ItemValue } from "../item";
import type { ItemDisplayFields } from "../entities.generated";
import type { Pos } from "../pos";
import { Vec3, Quat } from "../transform-math";

export type { Vec3, Quat };

/**
 * An entity condition: a selector tested with `if` or `unless`. From `display.exists` /
 * `notExist`,
 * used by `ctx.summonIf`.
 */
export interface EntityCondition {
  selector: Selector;
  mode: "if" | "unless";
}

/** Per-display transform; any omitted field falls back to identity. */
export interface Transform {
  translation?: Vec3;
  scale?: Vec3;
  leftRotation?: Quat;
  rightRotation?: Quat;
}

/**
 * What one display member renders. `context` is the item model's display section (`fixed`,
 * `head`…).
 */
export type DisplayContent =
  | { readonly kind: "block"; readonly block: BlockValue }
  | {
      readonly kind: "item";
      readonly item: ItemValue;
      readonly context?: ItemDisplayFields["itemDisplay"];
    };

export interface DisplayChild {
  content: DisplayContent;
  transform: Transform;
}

/** Everything a display group has been told besides its members. */
export interface DisplayState {
  pivot: Vec3;
  offset: Vec3;
  name?: string;
  pos: Pos | string;
  brightness?: { block: number; sky: number };
  hitbox?: { width: number; height: number; response: boolean };
  interpolation?: number;
  teleportDuration?: number;
}
