import { VersionProfile } from "../../versions/profile";
import type { FunctionContext } from "../frontend/context";
// Selector is used only inside method bodies (kill), never at module-init, so
// this value import does not trip the frontend<->values cycle.
import { Selector } from "../frontend/nodes/selector";
import { BlockValue } from "./block";
import { Float, NbtInput } from "./nbt";
import type { IdentifiedEntityNbt } from "./entity-nbt";
import type { ItemValue } from "./item";
import { BlockDisplay, Interaction, ItemDisplay } from "./entities.generated";
import type { ItemDisplayFields } from "./entities.generated";
import { CommandValue } from "./value";
import { Pos, PosValue } from "./pos";
import { Vec3, Quat, add } from "./transform-math";

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

/**
 * What one member of a display group renders. `context` is the item model's
 * `display` section (`fixed`, `head`, …) - typed straight off the generated
 * schema's own field, so this file never restates a vocabulary mcdoc owns.
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

/**
 * The entity a group summons as, taken from the generated schema rather than spelled
 * out here. Members carry their own id via `asPassenger()`.
 */
const ROOT_ENTITY = BlockDisplay({}).entity;

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
 * A display **group**: a root member plus child members carried as `Passengers`,
 * each rendering either a block state (`block_display`) or an item stack
 * (`item_display`), and optionally an `interaction` hitbox riding the root.
 * Renders to the summon data tag - pass it as the `nbt` arg:
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
  private _offset: Vec3 = [0, 0, 0];
  private _name?: string;
  private _pos: Pos | string = "~ ~ ~";
  private _brightness?: { block: number; sky: number };
  private _hitbox?: { width: number; height: number; response: boolean };
  private _interpolation?: number;
  private _teleportDuration?: number;

  constructor(
    private content: DisplayContent,
    private readonly rootTransform: Transform = {},
  ) {}

  /** The entity id to summon this with (`ctx.summon(Display.id, ...)`). */
  static readonly id = ROOT_ENTITY;

  /** Replace the root member with a block. */
  setBlock(block: BlockValue): this {
    this.content = { kind: "block", block };
    return this;
  }

  /** Replace the root member with an item. */
  setItem(item: ItemValue, context?: ItemDisplayFields["itemDisplay"]): this {
    this.content = { kind: "item", item, context };
    return this;
  }

  /** Append a child block display at the given transform. */
  add(block: BlockValue, transform: Transform = {}): this {
    this.children.push({ content: { kind: "block", block }, transform });
    return this;
  }

  /**
   * Append a child **item** display - a custom-modelled item is one member
   * instead of the dozens of cubes the same shape costs in blocks.
   */
  addItem(
    item: ItemValue,
    transform: Transform = {},
    context?: ItemDisplayFields["itemDisplay"],
  ): this {
    this.children.push({ content: { kind: "item", item, context }, transform });
    return this;
  }

  /**
   * Give the group a **hitbox**. Display entities have none - nothing can hit
   * them, and nothing can stand on them - so this rides an `interaction` entity
   * on the root, which is the vanilla primitive that *does* have one: a cube
   * `width` across and `height` tall that records the last attack/use in its own
   * NBT (readable at `attack.player` / `interaction.player`).
   *
   * Both default to the model's own {@link boundsSize}. `response` (default
   * `true`) is whether hitting it plays the hit sound / swings the arm.
   *
   * Relaying that recorded hit onto a real mob is deliberately *not* here: it's a
   * gameplay convention, so it belongs a layer up. This is the mechanism.
   */
  hitbox(width?: number, height?: number, response = true): this {
    const [bx, by, bz] = this.boundsSize();
    // ponytail: the box is anchored at the group origin and spans up from it,
    // because a passenger can't be offset from its vehicle. A model whose bounds
    // don't start at the origin wants explicit dims (or its own mounted entity).
    this._hitbox = { width: width ?? Math.max(bx, bz), height: height ?? by, response };
    return this;
  }

  /** A selector for the hitbox alone - what an attack-relay reads. */
  hitboxSelector(): string {
    if (!this._hitbox) throw new Error("Display has no hitbox - call .hitbox() first.");
    return `@e[tag=${this.getName()}_hitbox]`;
  }

  /**
   * Tween transform changes over `ticks` instead of snapping to them. Display
   * entities don't interpolate for free: the duration is stored **on the entity**
   * and every later update has to re-trigger it (`start_interpolation`), which is
   * what the clip engine's transform writes already do - this sets the resting
   * default so an ad-hoc `data merge` moves smoothly too.
   */
  interpolation(ticks: number): this {
    this._interpolation = ticks;
    return this;
  }

  /**
   * Glide over `ticks` when **teleported** rather than jumping. Separate from
   * {@link interpolation} in vanilla (transform tweening and positional tweening
   * are different fields), and the one that matters for a model being moved
   * around by `tp` - a boss rig following its mob, say.
   */
  teleportDuration(ticks: number): this {
    this._teleportDuration = ticks;
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

  /**
   * Shift **every** member by `v`. The knob for a group that doesn't sit where its
   * entity does - chiefly a rig *riding* a mob: a passenger is planted at the
   * vehicle's mount point (roughly `height * 0.75` up), so the model floats unless
   * the group is pushed back down by that much. The interaction hitbox is
   * deliberately not moved: it can't be offset from its vehicle at all.
   */
  offset(v: Vec3): this {
    this._offset = v;
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
    ctx.summon(this.toNbt(), pos instanceof PosValue ? pos : Pos.raw(pos));
  }

  /** Summon the display only when `cond` holds (e.g. `cog.notExist`). */
  summonIf(ctx: FunctionContext, cond: EntityCondition): void {
    ctx.summonIf(cond, this);
  }

  /** Remove every member of the group. */
  kill(ctx: FunctionContext): void {
    ctx.kill(Selector.allEntities().tag(this.getName()));
  }

  /**
   * Ordered members - root first (index 0), then the added children. The hitbox
   * is **not** one: it carries no transform, so nothing that animates members
   * should ever address it.
   */
  members(): DisplayChild[] {
    const all = [{ content: this.content, transform: this.rootTransform }, ...this.children];
    if (this._offset.every((n) => n === 0)) return all;
    return all.map((m) => ({
      ...m,
      transform: { ...m.transform, translation: add(m.transform.translation ?? [0, 0, 0], this._offset) },
    }));
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

  /**
   * The typed `block_display` NBT this summons as - root first, children as
   * `passengers`. Built through the entity's own schema, so the key spellings and
   * SNBT suffixes are the compiler's business, not this file's.
   */
  toNbt(): IdentifiedEntityNbt {
    const tags = (suffix: string) =>
      this._name ? [this._name, `${this._name}_${suffix}`] : undefined;

    const hitboxNbt = (): IdentifiedEntityNbt[] =>
      this._hitbox
        ? [
            Interaction({
              width: this._hitbox.width,
              height: this._hitbox.height,
              response: this._hitbox.response,
              tags: tags("hitbox"),
            }).asPassenger(),
          ]
        : [];

    // Through `members()`, so a group `offset` reaches the emitted NBT.
    const all = this.members();
    const member = (c: DisplayChild, idx: number): IdentifiedEntityNbt => {
      // A passenger names its own entity type; the root's comes from the summon.
      const riders =
        idx === 0 ? [...all.slice(1).map((c, i) => member(c, i + 1)), ...hitboxNbt()] : [];
      const common = {
        transformation: transformNbt(c.transform),
        brightness: this._brightness,
        interpolationDuration: this._interpolation,
        teleportDuration: this._teleportDuration,
        tags: tags(String(idx)),
        passengers: riders.length > 0 ? riders : undefined,
      };
      // Content first, so a block group renders byte-identically to before items existed.
      const nbt =
        c.content.kind === "block"
          ? BlockDisplay({ blockState: c.content.block, ...common })
          : ItemDisplay({
              item: c.content.item.stackNbt(),
              itemDisplay: c.content.context,
              ...common,
            });
      return idx === 0 ? nbt : nbt.asPassenger();
    };
    return member(all[0], 0);
  }

  render(version: VersionProfile): string {
    return this.toNbt().render(version);
  }
}

export type Display = DisplayValue;
export const Display = Object.assign(
  (block: BlockValue, rootTransform?: Transform): DisplayValue =>
    new DisplayValue({ kind: "block", block }, rootTransform),
  {
    id: DisplayValue.id,
    /** A group whose root is an **item** display (a custom-modelled item rig). */
    item: (
      item: ItemValue,
      rootTransform?: Transform,
      context?: ItemDisplayFields["itemDisplay"],
    ): DisplayValue => new DisplayValue({ kind: "item", item, context }, rootTransform),
  },
);
