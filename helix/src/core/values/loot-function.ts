import { VersionProfile } from "../../versions/profile";
import { ItemValue } from "./item";
import { normalizeId } from "../../versions/registry";

/** A roll/count value: an exact int or an inclusive `{min,max}` range. */
export type NumberProvider = number | { min: number; max: number };

/**
 * One **loot function** - a transform applied to a generated item stack. The same
 * vocabulary is used inside loot-table entries/pools ({@link LootTable}) and as the
 * whole body of an {@link ItemModifier}, so it is defined once here and shared.
 *
 * Functions are built from typed concepts (an {@link ItemValue}'s own components,
 * not hand-written JSON) wherever a value object can supply them.
 *
 *   LootFunction.setCount(4)
 *   LootFunction.setComponents(Item.DIAMOND_SWORD.named("Excalibur"))
 */
export class LootFunction {
  private constructor(
    private readonly build: (v: VersionProfile) => Record<string, unknown>,
  ) {}

  /** The function JSON, with embedded values rendered for `version`. */
  toJson(version: VersionProfile): Record<string, unknown> {
    return this.build(version);
  }

  /** `minecraft:set_count` - set (or, with `add`, increment) the stack size. */
  static setCount(count: NumberProvider, add = false): LootFunction {
    return new LootFunction(() => ({
      function: "minecraft:set_count",
      count,
      ...(add ? { add: true } : {}),
    }));
  }

  /**
   * `minecraft:set_components` - apply `item`'s data components to the stack, reusing
   * the item's own component definitions ({@link ItemValue.componentsJson}) so a
   * loot drop carries the exact components the same item would `give`. No-op JSON
   * on pre-component versions.
   */
  static setComponents(item: ItemValue): LootFunction {
    return new LootFunction((v) => ({
      function: "minecraft:set_components",
      components: item.componentsJson(v),
    }));
  }

  /** `minecraft:enchant_with_levels` - enchant as if at `levels` (optionally `treasure`). */
  static enchantWithLevels(levels: NumberProvider, treasure = false): LootFunction {
    return new LootFunction(() => ({
      function: "minecraft:enchant_with_levels",
      levels,
      ...(treasure ? { options: "#minecraft:on_random_loot" } : {}),
    }));
  }

  /** `minecraft:furnace_smelt` - replace with the item's smelting result. */
  static furnaceSmelt(): LootFunction {
    return new LootFunction(() => ({ function: "minecraft:furnace_smelt" }));
  }

  /**
   * Escape hatch: a function by id with already-built fields, e.g.
   * `LootFunction.of("set_name", { name: "Boss Loot" })`. `minecraft:` is added
   * to a bare id.
   */
  static of(fn: string, fields: Record<string, unknown> = {}): LootFunction {
    return new LootFunction(() => ({ function: normalizeId(fn), ...fields }));
  }
}
