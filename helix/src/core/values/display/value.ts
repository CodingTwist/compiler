// `DisplayValue`: a summonable display group, plus the `Display` factory.
import { VersionProfile } from "../../../versions/profile";
import type { FunctionContext } from "../../frontend/context";
// Only used inside methods, so this value import doesn't trip the frontend/values cycle.
import { Selector } from "../../frontend/nodes/selector";
import { BlockValue } from "../block";
import type { IdentifiedEntityNbt } from "../entity-nbt";
import type { ItemValue } from "../item";
import type { ItemDisplayFields } from "../entities.generated";
import { CommandValue } from "../value";
import { Pos, PosValue } from "../pos";
import { Relation } from "../enums";
import { EntityType } from "../resource.generated";
import { DisplayBuilder } from "./builder";
import { entityFor, groupNbt } from "./nbt";
import type { EntityCondition, Transform, Vec3 } from "./types";

/**
 * A display group: a root plus child members as `Passengers`, each a block or item display,
 * with an optional `interaction` hitbox.
 *
 *   const d = Display(Block.POLISHED_BASALT.state({ axis: "x" }))
 *     .add(Block.WAXED_COPPER_BLOCK, { translation: [-0.5, -3.5, -0.5] });
 *   ctx.summon("minecraft:block_display", Pos.rel(0, 10, 0), d);
 */
export class DisplayValue extends DisplayBuilder implements CommandValue {
  /** The entity id to summon this with (`ctx.summon(Display.id, ...)`). */
  static readonly id = EntityType.BLOCK_DISPLAY;
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
    this.s.hitbox = { width: width ?? Math.max(bx, bz), height: height ?? by, response };
    return this;
  }

  /** A selector for the hitbox alone - what an attack-relay reads. */
  hitboxSelector(): Selector {
    if (!this.s.hitbox) throw new Error("Display has no hitbox - call .hitbox() first.");
    return Selector.allEntities().type(EntityType.INTERACTION).tag(`${this.getName()}_hitbox`);
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
    if (this.s.hitbox) types.push(EntityType.INTERACTION);
    for (const type of types) ctx.kill(Selector.allEntities().type(type).tag(this.getName()));
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
    return groupNbt(this.members(), this.s);
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
