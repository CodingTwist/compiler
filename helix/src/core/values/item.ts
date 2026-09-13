import { normalizeId } from "../../versions/registry";
import { CommandValue } from "./value";
import { withMembers } from "./members";
import { ITEM_IDS } from "../../versions/data/ids";
import { VersionProfile } from "../../versions/profile";
import { ModelRef } from "./model";
import { FireworkValue } from "./firework";
import { toSnbt, NbtInput } from "./nbt";
import { textJson as tellrawJson } from "./text-json";
import { TellrawPart } from "../frontend/nodes/tellraw_part";

/** Typed vanilla item tag ids, e.g. `ITEM_TAGS.PLANKS`. */
export { ITEM_TAGS } from "../../versions/data/ids";

/** Data version of 1.20.5, where item NBT was replaced by data components. */
const COMPONENTS_DATA_VERSION = 3837;

/**
 * 24w44a (1.21.4) added `item_model`. Before it, model handles fall back to
 * `custom_model_data`.
 */
const ITEM_MODEL_DATA_VERSION = 4174;

/**
 * 24w44a (1.21.4) made `custom_model_data` a struct, rendered `{floats:[n]}`; before, a
 * plain integer.
 */
const CUSTOM_MODEL_DATA_STRUCT_DATA_VERSION = 4174;

/**
 * Text for item names and lore: a string or a styled text component object.
 *
 *   item.named("Excalibur")
 *   item.named({ text: "Time Lantern", color: "aqua", italic: false })
 */
export type TextComponent = string | Record<string, unknown>;

/** Normalize either form to a text-component object. */
function textObj(value: TextComponent): Record<string, unknown> {
  return typeof value === "string" ? { text: value } : value;
}

/** Pre-1.20.5 text: a quoted JSON string, e.g. `'{"text":"Excalibur"}'`. */
function textSnbt(value: TextComponent): string {
  return `'${JSON.stringify(textObj(value))}'`;
}

/**
 * 1.20.5+ text: an SNBT compound, not a quoted string.
 * Quoting it shows the raw JSON in game and breaks `match_tool`.
 */
function textCompound(value: TextComponent): string {
  return JSON.stringify(textObj(value));
}

/** JSON text component - the predicate form of the above. */
function textJson(value: TextComponent): Record<string, unknown> {
  return textObj(value);
}

function renderEnchId(ench: string | CommandValue, version: VersionProfile): string {
  return typeof ench === "string" ? normalizeId(ench) : ench.render(version);
}

/** A block id or `#tag`, normalized to its namespaced form (`#minecraft:stone_bricks`). */
function normalizeBlockRef(ref: string): string {
  return ref.startsWith("#") ? "#" + normalizeId(ref.slice(1)) : normalizeId(ref);
}

/** The `<ns>:name` id a model handle points at (for the `item_model` component). */
function resolveModelId(handle: ModelRef | string): string {
  return handle instanceof ModelRef ? handle.render() : normalizeId(handle);
}

/** The legacy `custom_model_data` number for a model handle. Throws if it has none. */
function legacyModelData(handle: ModelRef | string, version: VersionProfile): number {
  const n = handle instanceof ModelRef ? handle.legacyModelData : undefined;
  if (n === undefined) {
    throw new Error(
      `Item.model(): version ${version.id} predates the item_model component; ` +
        `provide a legacy custom_model_data number (dp.model(name, def, legacyModelData)) ` +
        `or use .modelData(n) directly.`,
    );
  }
  return n;
}

/** Lower a `custom_model_data` integer to its version-aware component form. */
function customModelDataLowering(n: number, version: VersionProfile): ComponentLowering {
  const struct = version.dataVersion >= CUSTOM_MODEL_DATA_STRUCT_DATA_VERSION;
  return {
    // 1.21.4+ wraps the value in `{floats:[n]}`; older component versions keep
    // the bare integer.
    stack: struct ? `custom_model_data={floats:[${n}]}` : `custom_model_data=${n}`,
    key: "minecraft:custom_model_data",
    json: struct ? { floats: [n] } : n,
  };
}

/**
 * One item component in both forms: `stack` for give strings and `key`/`json` for item
 * predicates.
 * One definition means an item always matches its own predicate.
 */
interface ComponentLowering {
  /** `[...]` fragment, e.g. `custom_name={"text":"x"}`. */
  stack: string;
  /** Namespaced component key for predicate `components`, or undefined to omit from predicates. */
  key?: string;
  /** Predicate `components` value matching `stack`. */
  json?: unknown;
}

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
export class ItemValue implements CommandValue {
  private dataStr?: string;
  private countValue?: number;
  private customNameValue?: TextComponent;
  private customModelDataValue?: number;
  private itemModelValue?: ModelRef | string;
  private enchantmentsValue: [string | CommandValue, number][] = [];
  private loreValue: TextComponent[] = [];
  private canPlaceOnValue: string[] = [];
  private writtenBookValue?: { title: string; author: string; pages: (TellrawPart | string | TellrawPart[])[] };
  private extraComponents: {
    stack: string | ((version: VersionProfile) => string);
    key?: string;
    json?: unknown;
  }[] = [];
  private subPredicates: { type: string; json: unknown }[] = [];

  constructor(private readonly id: string) {}

  /** Verbatim data escape hatch (`[components]` on 1.20.5+, `{nbt}` before). */
  data(data: string): this {
    this.dataStr = data;
    return this;
  }

  /** Stack size carried with the item (used by `give`; a count range for predicates). */
  count(n: number): this {
    this.countValue = n;
    return this;
  }

  /** `custom_name` / `display.Name`. Accepts a plain string or a styled {@link TextComponent}. */
  named(name: TextComponent): this {
    this.customNameValue = name;
    return this;
  }

  /**
   * Raw `custom_model_data` integer, for externally managed models. Prefer {@link model}.
   */
  modelData(n: number): this {
    this.customModelDataValue = n;
    return this;
  }

  /**
   * Points the item at a model by ref or `<ns>:name`. Renders as `item_model` on 1.21.4+;
   * older versions need the ref's legacy `custom_model_data` number or it throws.
   */
  model(handle: ModelRef | string): this {
    this.itemModelValue = handle;
    return this;
  }

  /** Add an enchantment + level (repeatable). */
  enchant(enchantment: string | CommandValue, level: number): this {
    this.enchantmentsValue.push([enchantment, level]);
    return this;
  }

  /** Append lore lines (`lore` / `display.Lore`). Each line is a string or styled {@link TextComponent}. */
  lore(...lines: TextComponent[]): this {
    this.loreValue.push(...lines);
    return this;
  }

  /**
   * Blocks this item can be placed on in adventure mode. Each is a block id or `#tag`.
   *
   * Renders as the `can_place_on` component on 1.20.5+, `CanPlaceOn` NBT before.
   */
  canPlaceOn(...blocks: string[]): this {
    this.canPlaceOnValue.push(...blocks.map(normalizeBlockRef));
    return this;
  }

  /**
   * `minecraft:written_book_content`: title, author and pages.
   *
   * Each page is a string, a styled span, or an array of spans. Pages are stored as text
   * compounds,
   * not JSON strings; a JSON string page shows its source as text. Throws before 1.20.5.
   */
  writtenBook(title: string, author: string, pages: (TellrawPart | string | TellrawPart[])[]): this {
    this.writtenBookValue = { title, author, pages };
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
    this.extraComponents.push({
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
    this.subPredicates.push({ type: normalizeId(type), json });
    return this;
  }

  /** The normalized item id with no data/components (`minecraft:diamond`, `#minecraft:planks`). */
  baseId(): string {
    return this.id.startsWith("#")
      ? "#" + normalizeId(this.id.slice(1))
      : normalizeId(this.id);
  }

  /** The count set via {@link count}, if any. */
  getCount(): number | undefined {
    return this.countValue;
  }

  /** Whether any structured data/components have been defined. */
  private hasStructuredData(): boolean {
    return (
      this.customNameValue !== undefined ||
      this.customModelDataValue !== undefined ||
      this.itemModelValue !== undefined ||
      this.enchantmentsValue.length > 0 ||
      this.loreValue.length > 0 ||
      this.canPlaceOnValue.length > 0 ||
      this.writtenBookValue !== undefined ||
      this.extraComponents.length > 0
    );
  }

  /**
   * A book page as a text compound. Typed as a record so a JSON string page can't compile.
   */
  private static pageJson(page: TellrawPart | string | TellrawPart[]): Record<string, NbtInput> {
    if (Array.isArray(page)) {
      return { text: "", extra: page.map((part) => tellrawJson(part)) };
    }
    return typeof page === "string" ? { text: page } : tellrawJson(page);
  }

  private modernComponents(version: VersionProfile): ComponentLowering[] {
    const out: ComponentLowering[] = [];
    if (this.customNameValue !== undefined) {
      out.push({
        stack: `custom_name=${textCompound(this.customNameValue)}`,
        key: "minecraft:custom_name",
        json: textJson(this.customNameValue),
      });
    }
    if (this.customModelDataValue !== undefined) {
      out.push(customModelDataLowering(this.customModelDataValue, version));
    }
    if (this.itemModelValue !== undefined) {
      if (version.dataVersion >= ITEM_MODEL_DATA_VERSION) {
        const id = resolveModelId(this.itemModelValue);
        out.push({
          stack: `item_model="${id}"`,
          key: "minecraft:item_model",
          json: id,
        });
      } else {
        // 1.20.5..1.21.3 has components but no `item_model`, so use the legacy number.
        out.push(customModelDataLowering(legacyModelData(this.itemModelValue, version), version));
      }
    }
    if (this.enchantmentsValue.length > 0) {
      const pairs = this.enchantmentsValue.map(
        ([e, l]) => [renderEnchId(e, version), l] as const,
      );
      out.push({
        stack: `enchantments={${pairs.map(([id, l]) => `"${id}":${l}`).join(",")}}`,
        key: "minecraft:enchantments",
        json: Object.fromEntries(pairs),
      });
    }
    if (this.loreValue.length > 0) {
      out.push({
        stack: `lore=[${this.loreValue.map(textCompound).join(",")}]`,
        key: "minecraft:lore",
        json: this.loreValue.map(textJson),
      });
    }
    if (this.canPlaceOnValue.length > 0) {
      // `can_place_on` is a block predicate or a list of them, with no `predicates:`
      // wrapper.
      const blocks = this.canPlaceOnValue;
      const snbt = blocks.length === 1 ? `"${blocks[0]}"` : `[${blocks.map((b) => `"${b}"`).join(",")}]`;
      out.push({
        stack: `can_place_on={blocks:${snbt}}`,
        key: "minecraft:can_place_on",
        json: { blocks: blocks.length === 1 ? blocks[0] : blocks },
      });
    }
    if (this.writtenBookValue !== undefined) {
      const { title, author, pages } = this.writtenBookValue;
      const pagesNbt: Record<string, NbtInput>[] = pages.map((page) => ItemValue.pageJson(page));
      const value: NbtInput = { title, author, resolved: true, pages: pagesNbt };
      out.push({ stack: `written_book_content=${toSnbt(value, version)}` });
    }
    out.push(
      ...this.extraComponents.map((c) => ({
        ...c,
        stack: typeof c.stack === "string" ? c.stack : c.stack(version),
      })),
    );
    return out;
  }

  /** Pre-1.20.5 NBT fragments (between the `{}`). */
  private legacyNbt(version: VersionProfile): string {
    if (this.writtenBookValue !== undefined) {
      throw new Error(
        `Item.writtenBook() needs data components (1.20.5+); target version ${version.id} predates them.`,
      );
    }
    const nbt: string[] = [];
    const display: string[] = [];
    if (this.customNameValue !== undefined) {
      display.push(`Name:${textSnbt(this.customNameValue)}`);
    }
    if (this.loreValue.length > 0) {
      display.push(`Lore:[${this.loreValue.map(textSnbt).join(",")}]`);
    }
    if (display.length) nbt.push(`display:{${display.join(",")}}`);
    if (this.customModelDataValue !== undefined) {
      nbt.push(`CustomModelData:${this.customModelDataValue}`);
    }
    if (this.itemModelValue !== undefined) {
      nbt.push(`CustomModelData:${legacyModelData(this.itemModelValue, version)}`);
    }
    if (this.enchantmentsValue.length > 0) {
      const entries = this.enchantmentsValue
        .map(([e, l]) => `{id:"${renderEnchId(e, version)}",lvl:${l}}`)
        .join(",");
      nbt.push(`Enchantments:[${entries}]`);
    }
    if (this.canPlaceOnValue.length > 0) {
      nbt.push(`CanPlaceOn:[${this.canPlaceOnValue.map((b) => `"${b}"`).join(",")}]`);
    }
    return nbt.join(",");
  }

  /** Just the data fragment appended to the id in stack form (`[...]`/`{...}`/`""`). */
  renderData(version: VersionProfile): string {
    if (this.hasStructuredData()) {
      if (version.dataVersion >= COMPONENTS_DATA_VERSION) {
        const comps = this.modernComponents(version).map((c) => c.stack);
        return comps.length ? `[${comps.join(",")}]` : "";
      }
      const nbt = this.legacyNbt(version);
      return nbt ? `{${nbt}}` : "";
    }
    return this.dataStr ?? "";
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
    const out: Record<string, unknown> = { items: this.baseId() };
    if (this.countValue !== undefined) {
      out.count = { min: this.countValue, max: this.countValue };
    }
    if (this.hasStructuredData() && version.dataVersion >= COMPONENTS_DATA_VERSION) {
      const components: Record<string, unknown> = {};
      for (const c of this.modernComponents(version)) {
        if (c.key !== undefined) components[c.key] = c.json;
      }
      if (Object.keys(components).length) out.components = components;
    } else if (this.hasStructuredData()) {
      const nbt = this.legacyNbt(version);
      if (nbt) out.nbt = `{${nbt}}`;
    }
    if (this.subPredicates.length) {
      if (version.dataVersion < COMPONENTS_DATA_VERSION) {
        throw new Error(
          `Item sub-predicates need data components (1.20.5+); target version ${version.id} predates them.`,
        );
      }
      const predicates: Record<string, unknown> = {};
      for (const p of this.subPredicates) predicates[p.type] = p.json;
      out.predicates = predicates;
    }
    return out;
  }

  /**
   * The item's components as a `{ "minecraft:custom_name": ... }` map, for loot
   * `set_components` and similar.
   * Same definitions as {@link render}. Empty before components or for raw `.data(...)`
   * items.
   */
  componentsJson(version: VersionProfile): Record<string, unknown> {
    if (!this.hasStructuredData() || version.dataVersion < COMPONENTS_DATA_VERSION) {
      return {};
    }
    const out: Record<string, unknown> = {};
    for (const c of this.modernComponents(version)) {
      if (c.key !== undefined && c.json !== undefined) out[c.key] = c.json;
    }
    return out;
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
    const modern = version.dataVersion >= COMPONENTS_DATA_VERSION;
    const count = this.countValue ?? 1;
    const parts = [`id:"${this.baseId()}"`, modern ? `count:${count}` : `Count:${count}b`];

    if (this.hasStructuredData()) {
      if (modern) {
        // The compound uses the component's full id, which `key` holds.
        const entries = this.modernComponents(version).map((c) => {
          const eq = c.stack.indexOf("=");
          return `"${c.key ?? normalizeId(c.stack.slice(0, eq))}":${c.stack.slice(eq + 1)}`;
        });
        if (entries.length) parts.push(`components:{${entries.join(",")}}`);
      } else {
        const nbt = this.legacyNbt(version);
        if (nbt) parts.push(`tag:{${nbt}}`);
      }
    } else if (this.dataStr !== undefined) {
      throw new Error(
        `Item "${this.baseId()}" was defined with a raw .data(...) string, which has no ` +
          `item-stack NBT form. Build it from typed components (.named/.lore/.component) instead.`,
      );
    }

    return `{${parts.join(",")}}`;
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
