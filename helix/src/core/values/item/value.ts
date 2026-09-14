// `ItemValue`: an item that renders per version and per use, plus the `Item` factory.
import { ITEM_IDS } from "../../../versions/data/ids";
import { VersionProfile } from "../../../versions/profile";
import { withMembers } from "../members";
import { CommandValue } from "../value";
import { ItemBuilder } from "./builder";
import * as forms from "./forms";
import { baseId } from "./state";

/**
 * An item: id plus its name, model, enchantments, lore and components.
 *
 * Pass the same object to `give` and to predicates; it renders per version (components on
 * 1.20.5+, NBT before) and per use (stack string or predicate JSON).
 *
 *   const excalibur = Item("diamond_sword")
 *     .named("Excalibur").enchant("sharpness", 5).modelData(1234);
 *
 *   ctx.playerGive(Selector.nearest(), excalibur);          // give …[components] 1
 *   ctx.if(predicateCheck(dp.predicate("excalibur",         // if predicate … run …
 *     Predicate.matchTool(excalibur))), …);
 *
 * `.data(raw)` is an escape hatch for hand-written component strings.
 */
export class ItemValue extends ItemBuilder implements CommandValue {
  /** The normalized item id with no data/components (`minecraft:diamond`, `#minecraft:planks`). */
  baseId(): string {
    return baseId(this.s);
  }

  /** The count set via {@link count}, if any. */
  getCount(): number | undefined {
    return this.s.count;
  }

  /** Just the data fragment appended to the id in stack form (`[...]`/`{...}`/`""`). */
  renderData(version: VersionProfile): string {
    return forms.renderData(this.s, version);
  }

  /** The full item-stack string (`id` + data), version-aware. */
  render(version: VersionProfile): string {
    return this.baseId() + this.renderData(version);
  }

  /**
   * This item as `item_predicate` JSON, from the same definitions as {@link render}.
   * Items defined only by raw `.data(...)` match by id alone.
   */
  toPredicate(version: VersionProfile): Record<string, unknown> {
    return forms.toPredicate(this.s, version);
  }

  /**
   * The item's components as a `{ "minecraft:custom_name": ... }` map, for loot
   * `set_components` and similar.
   * Same definitions as {@link render}. Empty before components or for raw `.data(...)`
   * items.
   */
  componentsJson(version: VersionProfile): Record<string, unknown> {
    return forms.componentsJson(this.s, version);
  }

  /**
   * This item as an item-stack NBT compound, as stored in item frames, containers and
   * dropped items.
   *
   * Same definitions as {@link render} and {@link toPredicate}. `count`/`components` on
   * 1.20.5+,
   * `Count`/`tag` before. Throws for raw `.data(...)` items, which can't be converted.
   */
  toStackNbt(version: VersionProfile): string {
    return forms.toStackNbt(this.s, version);
  }

  /** {@link toStackNbt}, deferred so it can go inside an `Nbt({ Item: … })` compound. */
  stackNbt(): CommandValue {
    return { render: (version: VersionProfile) => this.toStackNbt(version) };
  }
}

export type Item = ItemValue;

/** An item from any id, or a generated member like `Item.DIAMOND`. */
export const Item = withMembers(
  (id: string): ItemValue => new ItemValue(id),
  ITEM_IDS,
  (id) => new ItemValue(id),
);
