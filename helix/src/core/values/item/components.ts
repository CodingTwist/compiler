// Lowers an item's settings to data components (1.20.5+), each in stack and predicate form.
import { normalizeId } from "../../../versions/registry";
import { VersionProfile } from "../../../versions/profile";
import { ModelRef } from "../model";
import { toSnbt, NbtInput } from "../nbt";
import { CommandValue } from "../value";
import type { ItemState } from "./state";
import { pageJson, textCompound, textJson } from "./text";
import {
  CUSTOM_MODEL_DATA_STRUCT_DATA_VERSION,
  ITEM_MODEL_DATA_VERSION,
} from "./versions";

/**
 * One item component in both forms: `stack` for give strings and `key`/`json` for item
 * predicates.
 * One definition means an item always matches its own predicate.
 */
export interface ComponentLowering {
  /** `[...]` fragment, e.g. `custom_name={"text":"x"}`. */
  stack: string;
  /** Namespaced component key for predicate `components`, or undefined to omit from predicates. */
  key?: string;
  /** Predicate `components` value matching `stack`. */
  json?: unknown;
}

export function renderEnchId(
  ench: string | CommandValue,
  version: VersionProfile,
): string {
  return typeof ench === "string" ? normalizeId(ench) : ench.render(version);
}

/** The `<ns>:name` id a model handle points at (for the `item_model` component). */
function resolveModelId(handle: ModelRef | string): string {
  return handle instanceof ModelRef ? handle.render() : normalizeId(handle);
}

/** The legacy `custom_model_data` number for a model handle. Throws if it has none. */
export function legacyModelData(
  handle: ModelRef | string,
  version: VersionProfile,
): number {
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
function customModelDataLowering(
  n: number,
  version: VersionProfile,
): ComponentLowering {
  const struct = version.dataVersion >= CUSTOM_MODEL_DATA_STRUCT_DATA_VERSION;
  return {
    // 1.21.4+ wraps the value in `{floats:[n]}`; older component versions keep
    // the bare integer.
    stack: struct
      ? `custom_model_data={floats:[${n}]}`
      : `custom_model_data=${n}`,
    key: "minecraft:custom_model_data",
    json: struct ? { floats: [n] } : n,
  };
}

/** Every component the item sets, in a fixed order so stack and predicate forms line up. */
export function modernComponents(
  s: ItemState,
  version: VersionProfile,
): ComponentLowering[] {
  const out: ComponentLowering[] = [];
  if (s.customName !== undefined) {
    out.push({
      stack: `custom_name=${textCompound(s.customName)}`,
      key: "minecraft:custom_name",
      json: textJson(s.customName),
    });
  }
  if (s.customModelData !== undefined) {
    out.push(customModelDataLowering(s.customModelData, version));
  }
  if (s.itemModel !== undefined) {
    if (version.dataVersion >= ITEM_MODEL_DATA_VERSION) {
      const id = resolveModelId(s.itemModel);
      out.push({
        stack: `item_model="${id}"`,
        key: "minecraft:item_model",
        json: id,
      });
    } else {
      // 1.20.5..1.21.3 has components but no `item_model`, so use the legacy number.
      out.push(
        customModelDataLowering(legacyModelData(s.itemModel, version), version),
      );
    }
  }
  if (s.enchantments.length > 0) {
    const pairs = s.enchantments.map(
      ([e, l]) => [renderEnchId(e, version), l] as const,
    );
    out.push({
      stack: `enchantments={${pairs.map(([id, l]) => `"${id}":${l}`).join(",")}}`,
      key: "minecraft:enchantments",
      json: Object.fromEntries(pairs),
    });
  }
  if (s.lore.length > 0) {
    out.push({
      stack: `lore=[${s.lore.map(textCompound).join(",")}]`,
      key: "minecraft:lore",
      json: s.lore.map(textJson),
    });
  }
  if (s.canPlaceOn.length > 0) {
    // `can_place_on` is a block predicate or a list of them, with no `predicates:`
    // wrapper.
    const blocks = s.canPlaceOn;
    const snbt =
      blocks.length === 1
        ? `"${blocks[0]}"`
        : `[${blocks.map((b) => `"${b}"`).join(",")}]`;
    out.push({
      stack: `can_place_on={blocks:${snbt}}`,
      key: "minecraft:can_place_on",
      json: { blocks: blocks.length === 1 ? blocks[0] : blocks },
    });
  }
  if (s.writtenBook !== undefined) {
    const { title, author, pages } = s.writtenBook;
    const pagesNbt: Record<string, NbtInput>[] = pages.map((page) =>
      pageJson(page),
    );
    const value: NbtInput = { title, author, resolved: true, pages: pagesNbt };
    out.push({ stack: `written_book_content=${toSnbt(value, version)}` });
  }
  out.push(
    ...s.extraComponents.map((c) => ({
      ...c,
      stack: typeof c.stack === "string" ? c.stack : c.stack(version),
    })),
  );
  return out;
}
