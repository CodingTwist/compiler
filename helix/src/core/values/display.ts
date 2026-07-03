import { VersionProfile } from "../../versions/profile";
import type { FunctionContext } from "../frontend/context";
// Selector is used only inside method bodies (kill), never at module-init, so
// this value import does not trip the frontend<->values cycle.
import { Selector } from "../frontend/nodes/selector";
import { EntityType } from "./resource.generated";
import { BlockValue } from "./block";
import { Float, Nbt, NbtInput, toSnbt } from "./nbt";
import { CommandValue } from "./value";
import { Pos, PosValue } from "./pos";
import { Vec3, Quat } from "./transform-math";

export type { Vec3, Quat };

/**
 * A pure entity condition: a selector plus whether it's tested with `if` or
 * `unless`. Produced by `display.exists` / `display.notExist` and consumed by
 * `ctx.summonIf` (and the `entity_guard` handler). Kept as plain data here so it
 * stays a leaf value with no command imports.
 */
export interface EntityCondition {
  selector: string;
  mode: "if" | "unless";
}

/** Per-display transform; any omitted field falls back to identity. */
export interface Transform {
  translation?: Vec3;
  scale?: Vec3;
  leftRotation?: Quat;
  rightRotation?: Quat;
}

export interface DisplayChild {
  block: BlockValue;
  transform: Transform;
}

const IDENTITY_QUAT: Quat = [0, 0, 0, 1];
const UNIT_SCALE: Vec3 = [1, 1, 1];

function transformNbt(t: Transform): NbtInput {
  const vec = (v: Vec3 | Quat) => v.map(Float);
  return {
    left_rotation: vec(t.leftRotation ?? IDENTITY_QUAT),
    right_rotation: vec(t.rightRotation ?? IDENTITY_QUAT),
    scale: vec(t.scale ?? UNIT_SCALE),
    translation: vec(t.translation ?? [0, 0, 0]),
  };
}

/**
 * A `block_display` made of a root block plus child block displays carried as
 * `Passengers`. Renders to the summon data tag - pass it as the `nbt` arg:
 *
 *   const d = Display(Block.POLISHED_BASALT.state({ axis: "x" }))
 *     .add(Block.WAXED_COPPER_BLOCK, { translation: [-0.5, -3.5, -0.5] });
 *   ctx.summon("minecraft:block_display", Pos.rel(0, 10, 0), d);
 *
 * Children are kept in a mutable array, so you can build them from a loop and
 * swap blocks programmatically before rendering.
 */
export class DisplayValue implements CommandValue {
  readonly children: DisplayChild[] = [];
  private _pivot: Vec3 = [0, 0, 0];
  private _name?: string;
  private _pos: Pos | string = "~ ~ ~";
  private _brightness?: { block: number; sky: number };

  constructor(
    private block: BlockValue,
    private readonly rootTransform: Transform = {},
  ) {}

  /** The entity id to summon this with (`ctx.summon(Display.id, ...)`). */
  static readonly id = "minecraft:block_display";

  /** Replace the root block. */
  setBlock(block: BlockValue): this {
    this.block = block;
    return this;
  }

  /** Append a child block display at the given transform. */
  add(block: BlockValue, transform: Transform = {}): this {
    this.children.push({ block, transform });
    return this;
  }

  /**
   * Pin the rendered light level so the display matches surrounding blocks
   * instead of falling back to dynamic per-entity lighting (which samples one
   * point and usually renders darker / flickers as it moves). Both `block` and
   * `sky` are 0–15; `sky` defaults to the same as `block`. Use `15, 15` for
   * full-bright. Applies to every member (each passenger is its own entity).
   */
  brightness(block: number, sky: number = block): this {
    this._brightness = { block, sky };
    return this;
  }

  /** Set the local-space pivot the group rotates about (default origin). */
  pivot(p: Vec3): this {
    this._pivot = p;
    return this;
  }

  getPivot(): Vec3 {
    return this._pivot;
  }

  /**
   * Give the display an identity. Every member is tagged `Tags:["<name>",
   * "<name>_<i>"]` (root is index 0), so the whole group is addressable by
   * `@e[tag=<name>]` and each member by `@e[tag=<name>_<i>]`. Required before
   * summoning/killing/animating. Unnamed displays render with no tags (static
   * packs stay byte-identical).
   */
  named(name: string): this {
    this._name = name;
    return this;
  }

  /** The display's name/tag; throws if {@link named} was never called. */
  getName(): string {
    if (this._name === undefined) {
      throw new Error(
        "Display has no name - call .named(...) before summoning/animating it.",
      );
    }
    return this._name;
  }

  /** Set the position this display is summoned at. */
  at(pos: Pos | string): this {
    this._pos = pos;
    return this;
  }

  getPos(): Pos | string {
    return this._pos;
  }

  /** A selector matching the whole group: `@e[tag=<name>]`. */
  selector(): string {
    return `@e[tag=${this.getName()}]`;
  }

  /** Condition: the group is currently spawned. */
  get exists(): EntityCondition {
    return { selector: this.selector(), mode: "if" };
  }

  /** Condition: the group is not currently spawned. */
  get notExist(): EntityCondition {
    return { selector: this.selector(), mode: "unless" };
  }

  /** Summon the display at its {@link at} position. */
  summon(ctx: FunctionContext): void {
    const pos = this.getPos();
    ctx.summon(
      EntityType(DisplayValue.id),
      pos instanceof PosValue ? pos : Pos.raw(pos),
      Nbt(this),
    );
  }

  /** Summon the display only when `cond` holds (e.g. `cog.notExist`). */
  summonIf(ctx: FunctionContext, cond: EntityCondition): void {
    ctx.summonIf(cond, this);
  }

  /** Remove every member of the group. */
  kill(ctx: FunctionContext): void {
    ctx.kill(Selector.allEntities().tag(this.getName()));
  }

  /** Ordered members - root first (index 0), then the added children. */
  members(): DisplayChild[] {
    return [{ block: this.block, transform: this.rootTransform }, ...this.children];
  }

  /**
   * The min corner of the model's block volume in entity-local space - the
   * smallest member translation on each axis. A `block_display` member with
   * translation `t` occupies the cube `[entity + t, entity + t + 1]`, so summoning
   * at `worldCorner - boundsMin()` makes the model's lowest block land exactly on
   * `worldCorner`. Used to overlay a display on the real blocks it stands in for.
   */
  boundsMin(): Vec3 {
    const ts = this.members().map((m) => m.transform.translation ?? [0, 0, 0]);
    return [0, 1, 2].map((a) => Math.min(...ts.map((t) => t[a]))) as Vec3;
  }

  /**
   * The model's size in whole blocks on each axis (max translation − min + 1).
   * For a model captured from a 2×16×7 structure this returns `[2, 16, 7]`, the
   * footprint the matching `.nbt` covers.
   */
  boundsSize(): Vec3 {
    const ts = this.members().map((m) => m.transform.translation ?? [0, 0, 0]);
    return [0, 1, 2].map((a) => {
      const lo = Math.min(...ts.map((t) => t[a]));
      const hi = Math.max(...ts.map((t) => t[a]));
      return Math.round(hi - lo) + 1;
    }) as Vec3;
  }

  render(version: VersionProfile): string {
    const tags = (i: number): Record<string, NbtInput> =>
      this._name ? { Tags: [this._name, `${this._name}_${i}`] } : {};
    const brightness: Record<string, NbtInput> = this._brightness
      ? { brightness: { block: this._brightness.block, sky: this._brightness.sky } }
      : {};
    const passenger = (c: DisplayChild, idx: number): NbtInput => ({
      block_state: c.block.toBlockState(),
      id: DisplayValue.id,
      transformation: transformNbt(c.transform),
      ...brightness,
      ...tags(idx + 1),
    });
    const root: NbtInput = {
      block_state: this.block.toBlockState(),
      transformation: transformNbt(this.rootTransform),
      ...brightness,
      ...tags(0),
    };
    if (this.children.length > 0) {
      root.Passengers = this.children.map(passenger);
    }
    return toSnbt(root, version);
  }
}

export type Display = DisplayValue;
export const Display = Object.assign(
  (block: BlockValue, rootTransform?: Transform): DisplayValue =>
    new DisplayValue(block, rootTransform),
  { id: DisplayValue.id },
);
