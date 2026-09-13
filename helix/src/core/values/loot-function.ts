import { VersionProfile } from "../../versions/profile";
import { ItemValue } from "./item";
import { normalizeId } from "../../versions/registry";

/** A roll/count value: an exact int or an inclusive `{min,max}` range. */
export type NumberProvider = number | { min: number; max: number };

/**
 * A loot function: a transform on a generated item stack. Shared by loot tables and {@link
 * ItemModifier}s.
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

  /** `minecraft:set_components`: applies `item`'s components, the same ones `give` would. */
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
   * Escape hatch: a function by id with prebuilt fields, e.g. `LootFunction.of("set_name",
   * { name: "Boss Loot" })`.
   */
  static of(fn: string, fields: Record<string, unknown> = {}): LootFunction {
    return new LootFunction(() => ({ function: normalizeId(fn), ...fields }));
  }
}
