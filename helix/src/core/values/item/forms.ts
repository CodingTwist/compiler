// Renders an item for each use: give-stack data, item predicate, components map, stack NBT.
import { normalizeId } from "../../../versions/registry";
import { VersionProfile } from "../../../versions/profile";
import { modernComponents } from "./components";
import { legacyNbt } from "./legacy";
import { baseId, hasStructuredData, type ItemState } from "./state";
import { COMPONENTS_DATA_VERSION } from "./versions";

/** Just the data fragment appended to the id in stack form (`[...]`/`{...}`/`""`). */
export function renderData(s: ItemState, version: VersionProfile): string {
  if (hasStructuredData(s)) {
    if (version.dataVersion >= COMPONENTS_DATA_VERSION) {
      const comps = modernComponents(s, version).map((c) => c.stack);
      return comps.length ? `[${comps.join(",")}]` : "";
    }
    const nbt = legacyNbt(s, version);
    return nbt ? `{${nbt}}` : "";
  }
  return s.data ?? "";
}

/**
 * This item as `item_predicate` JSON, from the same definitions as `render`.
 * Items defined only by raw `.data(...)` match by id alone.
 */
export function toPredicate(
  s: ItemState,
  version: VersionProfile,
): Record<string, unknown> {
  const out: Record<string, unknown> = { items: baseId(s) };
  if (s.count !== undefined) {
    out.count = { min: s.count, max: s.count };
  }
  if (hasStructuredData(s) && version.dataVersion >= COMPONENTS_DATA_VERSION) {
    const components: Record<string, unknown> = {};
    for (const c of modernComponents(s, version)) {
      if (c.key !== undefined) components[c.key] = c.json;
    }
    if (Object.keys(components).length) out.components = components;
  } else if (hasStructuredData(s)) {
    const nbt = legacyNbt(s, version);
    if (nbt) out.nbt = `{${nbt}}`;
  }
  if (s.subPredicates.length) {
    if (version.dataVersion < COMPONENTS_DATA_VERSION) {
      throw new Error(
        `Item sub-predicates need data components (1.20.5+); target version ${version.id} predates them.`,
      );
    }
    const predicates: Record<string, unknown> = {};
    for (const p of s.subPredicates) predicates[p.type] = p.json;
    out.predicates = predicates;
  }
  return out;
}

/**
 * The item's components as a `{ "minecraft:custom_name": ... }` map, for loot
 * `set_components` and similar.
 * Same definitions as `render`. Empty before components or for raw `.data(...)`
 * items.
 */
export function componentsJson(
  s: ItemState,
  version: VersionProfile,
): Record<string, unknown> {
  if (!hasStructuredData(s) || version.dataVersion < COMPONENTS_DATA_VERSION) {
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const c of modernComponents(s, version)) {
    if (c.key !== undefined && c.json !== undefined) out[c.key] = c.json;
  }
  return out;
}

/**
 * This item as an item-stack NBT compound, as stored in item frames, containers and
 * dropped items.
 *
 * Same definitions as `render` and `toPredicate`. `count`/`components` on
 * 1.20.5+,
 * `Count`/`tag` before. Throws for raw `.data(...)` items, which can't be converted.
 */
export function toStackNbt(s: ItemState, version: VersionProfile): string {
  const modern = version.dataVersion >= COMPONENTS_DATA_VERSION;
  const count = s.count ?? 1;
  const parts = [
    `id:"${baseId(s)}"`,
    modern ? `count:${count}` : `Count:${count}b`,
  ];

  if (hasStructuredData(s)) {
    if (modern) {
      // The compound uses the component's full id, which `key` holds.
      const entries = modernComponents(s, version).map((c) => {
        const eq = c.stack.indexOf("=");
        return `"${c.key ?? normalizeId(c.stack.slice(0, eq))}":${c.stack.slice(eq + 1)}`;
      });
      if (entries.length) parts.push(`components:{${entries.join(",")}}`);
    } else {
      const nbt = legacyNbt(s, version);
      if (nbt) parts.push(`tag:{${nbt}}`);
    }
  } else if (s.data !== undefined) {
    throw new Error(
      `Item "${baseId(s)}" was defined with a raw .data(...) string, which has no ` +
        `item-stack NBT form. Build it from typed components (.named/.lore/.component) instead.`,
    );
  }

  return `{${parts.join(",")}}`;
}
