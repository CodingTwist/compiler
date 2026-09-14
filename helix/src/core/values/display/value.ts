import { VersionProfile } from "../../versions/profile";
import type { FunctionContext } from "../frontend/context";
// Only used inside methods, so this value import doesn't trip the frontend/values cycle.
import { Selector } from "../frontend/nodes/selector";
import { BlockValue } from "./block";
import { Float, NbtInput } from "./nbt";
import type { IdentifiedEntityNbt } from "./entity-nbt";
import type { ItemValue } from "./item";
import { BlockDisplay, DisplayBase, Interaction, ItemDisplay } from "./entities.generated";
import type { ItemDisplayFields } from "./entities.generated";
import { CommandValue } from "./value";
import { Pos, PosValue } from "./pos";
import { Relation } from "./enums";
import { EntityType } from "./resource.generated";
import { Vec3, Quat, add } from "./transform-math";

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

/** The display entity type for a member's content. */
const entityFor = (kind: DisplayContent["kind"]): EntityType =>
  kind === "block" ? EntityType.BLOCK_DISPLAY : EntityType.ITEM_DISPLAY;

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
 * One member's transform as display NBT for `data merge`. `interpolationDuration` 0 snaps.
 * Matches the summon NBT, so a pose from {@link DisplayValue.members} lands exactly on the
 * original.
 */
export function displayPose(t: Transform, interpolationDuration = 0) {
  return DisplayBase({
    transformation: transformNbt(t),
    startInterpolation: 0,
    interpolationDuration,
  });
}

/**
 * A display group: a root plus child members as `Passengers`, each a block or item display,
 * with an optional `interaction` hitbox.
 *
 *   const d = Display(Block.POLISHED_BASALT.state({ axis: "x" }))
 *     .add(Block.WAXED_COPPER_BLOCK, { translation: [-0.5, -3.5, -0.5] });
 *   ctx.summon("minecraft:block_display", Pos.rel(0, 10, 0), d);
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
  static readonly id = EntityType.BLOCK_DISPLAY;

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

  /** Adds an item display child. One custom-model item replaces many block members. */
  addItem(
    item: ItemValue,
    transform: Transform = {},
    context?: ItemDisplayFields["itemDisplay"],
  ): this {
    this.children.push({ content: { kind: "item", item, context }, transform });
    return this;
  }

  /**
   * Adds a hitbox: an `interaction` entity riding the root, since displays can't be hit.
   *
   * Size defaults to {@link boundsSize}. `response` controls the hit sound and arm swing.
   * Relaying hits to a mob is left to higher layers.
   */
  hitbox(width?: number, height?: number, response = true): this {
    const [bx, by, bz] = this.boundsSize();
    // ponytail: the box starts at the group origin, since passengers can't be offset.
    // Models not starting at the origin need explicit sizes.
    this._hitbox = { width: width ?? Math.max(bx, bz), height: height ?? by, response };
    return this;
  }

  /** A selector for the hitbox alone - what an attack-relay reads. */
  hitboxSelector(): Selector {
    if (!this._hitbox) throw new Error("Display has no hitbox - call .hitbox() first.");
    return Selector.allEntities().type(EntityType.INTERACTION).tag(`${this.getName()}_hitbox`);
  }

  /**
   * Default interpolation ticks for transform changes, so plain `data merge` updates move
   * smoothly.
   */
  interpolation(ticks: number): this {
    this._interpolation = ticks;
    return this;
  }

  /**
   * Ticks to glide when teleported. Separate from {@link interpolation}; matters for rigs
   * moved by `tp`.
   */
  teleportDuration(ticks: number): this {
    this._teleportDuration = ticks;
    return this;
  }

  /**
   * Fixes the light level (0–15) so displays match nearby blocks instead of rendering dark.
   * `sky` defaults to `block`. Applies to every member.
   */
  brightness(block: number, sky: number = block): this {
    this._brightness = { block, sky };
    return this;
  }

  /**
   * Shifts every member by `v`, e.g. to cancel a vehicle's mount point height. The hitbox
   * doesn't move.
   */
  offset(v: Vec3): this {
    this._offset = v;
    return this;
  }

  /** The shift {@link offset} applied - what {@link members} already carries. */
  getOffset(): Vec3 {
    return this._offset;
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
   * Tags every member `<name>` and `<name>_<i>` (root is 0). Required before summoning,
   * killing or animating.
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

  /** Condition: the group is currently spawned. */
  get exists(): EntityCondition {
    // The root is summoned and killed with the group, so it stands in for all of it.
    return { selector: this.rootSelector(), mode: "if" };
  }

  /** Condition: the group is not currently spawned. */
  get notExist(): EntityCondition {
    return { selector: this.rootSelector(), mode: "unless" };
  }

  /** Summon the display at its {@link at} position. */
  summon(ctx: FunctionContext): void {
    const pos = this.getPos();
    ctx.summon(this.toNbt(), pos instanceof PosValue ? pos : Pos.raw(pos));
  }

  /** Summons the display only when `cond` holds, e.g. `cog.notExist`. */
  summonIf(ctx: FunctionContext, cond: EntityCondition): void {
    ctx.summonIf(cond, this);
  }

  /** `@e[type=<root type>,tag=<name>_0]` - the root member, typed so the scan skips other entities. */
  rootSelector(): Selector {
    return this.memberSelector(0);
  }

  /** Typed selector for member `i` (`@e[type=<its display>,tag=<name>_<i>]`), in {@link members} order. */
  memberSelector(i: number): Selector {
    const kind = i === 0 ? this.content.kind : this.children[i - 1].content.kind;
    return Selector.allEntities().type(entityFor(kind)).tag(`${this.getName()}_${i}`);
  }

  /** Remove every member of the group: one typed scan for the root, the rest ride it. */
  kill(ctx: FunctionContext): void {
    ctx.execute().as(this.rootSelector()).run((c) => {
      c.execute().on(Relation.PASSENGERS).run((p) => p.kill(Selector.self()));
      c.kill(Selector.self());
    });
  }

  /**
   * Removes every member, riding or not, with one typed `kill` per entity type in the group.
   * For cleanup after a crash or `/reload`, when members may have come off the root.
   */
  killAll(ctx: FunctionContext): void {
    const types = [...new Set(this.members().map((m) => m.content.kind))].map(entityFor);
    if (this._hitbox) types.push(EntityType.INTERACTION);
    for (const type of types) ctx.kill(Selector.allEntities().type(type).tag(this.getName()));
  }

  /** Members in order, root first. The hitbox isn't included, since it has no transform. */
  members(): DisplayChild[] {
    const all = [{ content: this.content, transform: this.rootTransform }, ...this.children];
    if (this._offset.every((n) => n === 0)) return all;
    return all.map((m) => ({
      ...m,
      transform: { ...m.transform, translation: add(m.transform.translation ?? [0, 0, 0], this._offset) },
    }));
  }

  /**
   * The model's lowest block corner in entity space. Summon at `worldCorner - boundsMin()`
   * to align with real blocks.
   */
  boundsMin(): Vec3 {
    const ts = this.members().map((m) => m.transform.translation ?? [0, 0, 0]);
    return [0, 1, 2].map((a) => Math.min(...ts.map((t) => t[a]))) as Vec3;
  }

  /** The model's size in whole blocks per axis, e.g. `[2, 16, 7]`. */
  boundsSize(): Vec3 {
    const ts = this.members().map((m) => m.transform.translation ?? [0, 0, 0]);
    return [0, 1, 2].map((a) => {
      const lo = Math.min(...ts.map((t) => t[a]));
      const hi = Math.max(...ts.map((t) => t[a]));
      return Math.round(hi - lo) + 1;
    }) as Vec3;
  }

  /** The `block_display` NBT to summon, built through the entity schema. */
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
