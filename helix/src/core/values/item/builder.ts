// The item setters: name, model, enchantments, lore, components.
import { normalizeId } from "../../../versions/registry";
import { VersionProfile } from "../../../versions/profile";
import { TellrawPart } from "../../frontend/nodes/tellraw_part";
import { FireworkValue } from "../firework";
import { ModelRef } from "../model";
import { CommandValue } from "../value";
import type { Enchantment } from "../resource.generated";
import type { ItemState } from "./state";
import type { TextComponent } from "./text";
import type { ItemValue } from "./value";

/** A block id or `#tag`, normalized to its namespaced form (`#minecraft:stone_bricks`). */
function normalizeBlockRef(ref: string): string {
  return ref.startsWith("#")
    ? "#" + normalizeId(ref.slice(1))
    : normalizeId(ref);
}

/** The setters of {@link ItemValue}; each returns the item for chaining. */
export class ItemBuilder {
  protected readonly s: ItemState;

  constructor(id: string) {
    this.s = {
      id,
      enchantments: [],
      lore: [],
      canPlaceOn: [],
      extraComponents: [],
      subPredicates: [],
    };
  }

  /** Verbatim data escape hatch (`[components]` on 1.20.5+, `{nbt}` before). */
  data(data: string): this {
    this.s.data = data;
    return this;
  }

  /** Stack size carried with the item (used by `give`; a count range for predicates). */
  count(n: number): this {
    this.s.count = n;
    return this;
  }

  /** `custom_name` / `display.Name`. Accepts a plain string or a styled {@link TextComponent}. */
  named(name: TextComponent): this {
    this.s.customName = name;
    return this;
  }

  /**
   * Raw `custom_model_data` integer, for externally managed models. Prefer {@link model}.
   */
  modelData(n: number): this {
    this.s.customModelData = n;
    return this;
  }

  /**
   * Points the item at a model by ref or `<ns>:name`. Renders as `item_model` on 1.21.4+;
   * older versions need the ref's legacy `custom_model_data` number or it throws.
   */
  model(handle: ModelRef | string): this {
    this.s.itemModel = handle;
    return this;
  }

  /** Add an enchantment + level (repeatable). */
  enchant(enchantment: Enchantment, level: number): this {
    this.s.enchantments.push([enchantment, level]);
    return this;
  }

  /** Append lore lines (`lore` / `display.Lore`). Each line is a string or styled {@link TextComponent}. */
  lore(...lines: TextComponent[]): this {
    this.s.lore.push(...lines);
    return this;
  }

  /**
   * Blocks this item can be placed on in adventure mode. Each is a block id or `#tag`.
   *
   * Renders as the `can_place_on` component on 1.20.5+, `CanPlaceOn` NBT before.
   */
  canPlaceOn(...blocks: string[]): this {
    this.s.canPlaceOn.push(...blocks.map(normalizeBlockRef));
    return this;
  }

  /**
   * `minecraft:written_book_content`: title, author and pages.
   *
   * Each page is a string, a styled span, or an array of spans. Pages are stored as text
   * compounds,
   * not JSON strings; a JSON string page shows its source as text. Throws before 1.20.5.
   */
  writtenBook(
    title: string,
    author: string,
    pages: (TellrawPart | string | TellrawPart[])[],
  ): this {
    this.s.writtenBook = { title, author, pages };
    return this;
  }

  /**
   * `minecraft:charged_projectiles`: what a crossbow is loaded with, which also makes it
   * render loaded.
   */
  chargedProjectiles(...items: ItemValue[]): this {
    return this.component("charged_projectiles", {
      render: (version: VersionProfile) =>
        `[${items.map((i) => i.toStackNbt(version)).join(",")}]`,
    });
  }

  /** The `minecraft:fireworks` component - see {@link Firework}. */
  firework(value: FireworkValue): this {
    return this.component("fireworks", value);
  }

  /**
   * A raw component for things without a builder, e.g. `.component("unbreakable", "{}")`.
   * `key`/`json` let it match in predicates too.
   */
  component(
    name: string,
    stackValue: string | CommandValue,
    predicate?: { key: string; json: unknown },
  ): this {
    this.s.extraComponents.push({
      stack:
        typeof stackValue === "string"
          ? `${name}=${stackValue}`
          : (version) => `${name}=${stackValue.render(version)}`,
      key: predicate?.key,
      json: predicate?.json,
    });
    return this;
  }

  /**
   * An item sub-predicate: asks about a component instead of matching it exactly.
   *
   *   Item("diamond_sword").subPredicate("enchantments", [{}])   // any enchantment
   *   Item("diamond_sword").subPredicate("damage", { durability: { min: 1 } })
   *
   * Predicate-only; ignored when rendering a stack. For "absent", wrap in
   * `Predicate.not(...)`.
   * Throws before 1.20.5.
   */
  subPredicate(type: string, json: unknown): this {
    this.s.subPredicates.push({ type: normalizeId(type), json });
    return this;
  }
}
