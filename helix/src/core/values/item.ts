import { normalizeId } from "../../versions/registry";
import { CommandValue } from "./value";
import { withMembers } from "./members";
import { ITEM_IDS } from "../../versions/data/ids";
import { VersionProfile } from "../../versions/profile";
import { ModelRef } from "./model";

/**
 * The vanilla item *tags* (`ITEM_TAGS.PLANKS = "minecraft:planks"`), the
 * newest-version superset - typed, autocompleted ids for tag slots (`clear`, item
 * predicates) so authors never hand-write `"#minecraft:planks"`.
 */
export { ITEM_TAGS } from "../../versions/data/ids";

/** Data version of 1.20.5, where item NBT was replaced by data components. */
const COMPONENTS_DATA_VERSION = 3837;

/**
 * Data version of 24w44a (shipped in 1.21.4), where the `item_model` component +
 * `assets/<ns>/items/` item definitions arrived. At/after this a model handle
 * lowers to `item_model=<ns:name>`; before it there is no such component, so the
 * handle must fall back to a `custom_model_data` number.
 */
const ITEM_MODEL_DATA_VERSION = 4174;

/**
 * Data version of 24w44a (shipped in 1.21.4), where `custom_model_data` stopped
 * being a bare integer and became a struct of `{ floats, flags, strings, colors }`.
 * At/after this the component must render as `{floats:[n]}` in both the item-stack
 * string and an item predicate's `components` map; before it, the plain integer.
 */
const CUSTOM_MODEL_DATA_STRUCT_DATA_VERSION = 4174;

/**
 * A text component for an item's name/lore lines: a plain string (rendered as
 * `{"text":"..."}`) or a raw text-component object for styling - color, a
 * suppressed `italic`, click/hover, nested `extra`, etc. Keeps "typed concepts
 * not strings": authors build the component, the same object lowers to both the
 * SNBT stack form and the predicate JSON form.
 *
 *   item.named("Excalibur")
 *   item.named({ text: "Time Lantern", color: "aqua", italic: false })
 */
export type TextComponent = string | Record<string, unknown>;

/** Normalize either form to a text-component object. */
function textObj(value: TextComponent): Record<string, unknown> {
  return typeof value === "string" ? { text: value } : value;
}

/**
 * Legacy (pre-1.20.5) text component: a single-quoted *JSON string*, e.g.
 * `'{"text":"Excalibur"}'`. This is correct for NBT `display.Name`/`Lore`, where
 * the value is a string holding JSON.
 */
function textSnbt(value: TextComponent): string {
  return `'${JSON.stringify(textObj(value))}'`;
}

/**
 * Modern (1.20.5+) text component: an SNBT *compound*, e.g.
 * `{"text":"Excalibur","color":"aqua"}` - no surrounding quotes. Data components
 * store text as SNBT, so the value must be a compound. Wrapping it in quotes (the
 * legacy string-JSON form) makes newer versions show the literal JSON text and
 * breaks `match_tool` equality, so name/lore must use this form for components.
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

/**
 * The legacy `custom_model_data` number for a model handle on a version predating
 * the `item_model` component. Throws unless the handle carries one, since there's
 * no other way to reference a model there.
 */
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
 * One data component of an item, lowered to *both* forms from a single
 * definition: `stack` for the `give`/item-stack string (`id[stack,...]`) and
 * `key`/`json` for an `item_predicate`'s `components` map. Keeping both on one
 * object is what guarantees "define once" - a given item matches its own
 * predicate by construction.
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
 * An item - id plus an optional, structured definition of its data (name, model
 * data, enchantments, lore, raw components). **The single source of truth for an
 * item across the pack:** pass the same object to `give` to grant it, or to
 * `Predicate.matchTool(...)` / `Selector.holding(...)` to check for it. It lowers
 * itself per target version (data components on 1.20.5+, NBT before) and per
 * context (item-stack string vs `item_predicate` JSON) - you never re-encode it.
 *
 *   const excalibur = Item("diamond_sword")
 *     .named("Excalibur").enchant("sharpness", 5).modelData(1234);
 *
 *   ctx.playerGive(Selector.nearest(), excalibur);          // give …[components] 1
 *   ctx.if(predicateCheck(dp.predicate("excalibur",         // if predicate … run …
 *     Predicate.matchTool(excalibur))), …);
 *
 * Bare ids and `#tags` still work (`Item("diamond")`, `Item("#planks")`), and
 * `.data(raw)` is a verbatim escape hatch for hand-written component/NBT strings.
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
  private extraComponents: { stack: string; key?: string; json?: unknown }[] = [];

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
   * Raw `custom_model_data` / `CustomModelData` integer - the escape hatch for a
   * model you manage in an external resource pack. Prefer {@link model} with a
   * {@link ModelRef} from `dp.model(...)`, which generates the model + emits the
   * typed `item_model` component instead of a magic number.
   */
  modelData(n: number): this {
    this.customModelDataValue = n;
    return this;
  }

  /**
   * Point this item at a resource-pack model via its {@link ModelRef} (from
   * `dp.model(...)`) or a bare `<ns>:name`. Lowers to the `item_model` component
   * on 1.21.4+; on older versions it needs the ref's legacy `custom_model_data`
   * number (see {@link ModelRef}), else rendering throws.
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
   * Restrict where this item may be placed in adventure mode (`can_place_on`).
   * Each argument is a block id or `#tag` (`"minecraft:stone"`, `"#minecraft:stone_bricks"`).
   *
   * The shape is an `AdventureModePredicate`, which does *not* survive a naive
   * hand-encoding: on 1.20.5+ it lowers to the structured `can_place_on` component
   * (a `{blocks:…}` block predicate - the codec is `compactListCodec(BlockPredicate)`,
   * so there is no `predicates:` wrapper), while before components it is
   * the flat NBT `CanPlaceOn:[…]` string list - the same reason the pack never
   * hand-writes item NBT. Whether the restriction shows in the tooltip is a
   * separate concern (`tooltip_display` on modern, `HideFlags` before).
   */
  canPlaceOn(...blocks: string[]): this {
    this.canPlaceOnValue.push(...blocks.map(normalizeBlockRef));
    return this;
  }

  /**
   * A raw data component for things the typed builders don't model yet, e.g.
   * `.component("unbreakable", "{}")`. `key`/`json` are optional predicate
   * counterparts so it can still participate in `match_tool` matching.
   */
  component(name: string, stackValue: string, predicate?: { key: string; json: unknown }): this {
    this.extraComponents.push({
      stack: `${name}=${stackValue}`,
      key: predicate?.key,
      json: predicate?.json,
    });
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
      this.extraComponents.length > 0
    );
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
        // 1.20.5..1.21.3: components exist but `item_model` doesn't, so fall
        // back to the ref's legacy custom_model_data number.
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
      // `can_place_on` is an AdventureModePredicate, whose codec is
      // `compactListCodec(BlockPredicate)`: the value is a single block
      // predicate, or a list of them - there is no `predicates:` wrapper. A
      // block predicate matches with `{blocks:<id|#tag|list>}`, where `blocks`
      // is a HolderSet (a bare id/#tag for one block, a list for several).
      const blocks = this.canPlaceOnValue;
      const snbt = blocks.length === 1 ? `"${blocks[0]}"` : `[${blocks.map((b) => `"${b}"`).join(",")}]`;
      out.push({
        stack: `can_place_on={blocks:${snbt}}`,
        key: "minecraft:can_place_on",
        json: { blocks: blocks.length === 1 ? blocks[0] : blocks },
      });
    }
    out.push(...this.extraComponents);
    return out;
  }

  /** Pre-1.20.5 NBT fragments (between the `{}`). */
  private legacyNbt(version: VersionProfile): string {
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
   * This item as an `item_predicate` JSON object (the body of a `match_tool`
   * condition, or a recipe/equipment item check). Built from the same component
   * definitions as {@link render}, so a give'd item matches its own predicate.
   * Raw `.data(...)` strings can't be parsed back, so an item defined only that
   * way matches by id alone.
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
    return out;
  }

  /**
   * The item's data components as a `{ "minecraft:custom_name": ... }` map, for a
   * loot/recipe `set_components` function or any data-file that carries components
   * inline. Built from the same definitions as {@link render}/{@link toPredicate},
   * so a loot-granted item matches its give'd / predicate forms. Empty on versions
   * before components, or for an item defined only via raw `.data(...)` (which
   * can't be parsed back into structured components).
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
   * This item as an **item-stack NBT compound** - the shape an entity or block
   * entity stores a stack in (an item frame's `Item`, a container's `Items`
   * entry, a dropped item's `Item`), as opposed to the command-line stack string
   * {@link render} produces or the predicate JSON {@link toPredicate} produces.
   *
   * Same definitions, third rendering, so a named item summoned inside a frame is
   * the same value that `give`s and that a `match_tool` predicate matches. Version
   * aware in two places at once: `count`/`components` on 1.20.5+, `Count:1b`/`tag`
   * before it.
   *
   * A raw `.data(...)` escape hatch can't be lowered into this form (the string is
   * stack syntax, not NBT), so an item defined that way throws rather than
   * silently emitting a stack missing its data.
   */
  toStackNbt(version: VersionProfile): string {
    const modern = version.dataVersion >= COMPONENTS_DATA_VERSION;
    const count = this.countValue ?? 1;
    const parts = [`id:"${this.baseId()}"`, modern ? `count:${count}` : `Count:${count}b`];

    if (this.hasStructuredData()) {
      if (modern) {
        // `stack` is `name=<snbt value>`; the compound wants the same value under
        // the component's full id, which is exactly what `key` carries.
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

  /**
   * {@link toStackNbt} deferred, so the stack can be dropped straight into an
   * `Nbt({ Item: … })` compound and rendered with everything around it.
   */
  stackNbt(): CommandValue {
    return { render: (version: VersionProfile) => this.toStackNbt(version) };
  }
}

export type Item = ItemValue;

/**
 * Build an item from any id (custom namespaces, `#tags`, `.data(...)`), or use
 * a generated member for a known vanilla item: `Item.DIAMOND`.
 */
export const Item = withMembers(
  (id: string): ItemValue => new ItemValue(id),
  ITEM_IDS,
  (id) => new ItemValue(id),
);
