import type { Datapack } from "../ir/datapack";
import type { ItemValue } from "./item";
import { Predicate, PredicateRef, type EquipmentSpec } from "./predicate";

/** Options for {@link holdingPredicate}. */
export interface HoldingOptions {
  /** Equipment slot to test (default `mainhand` - a player's selected item). */
  slot?: keyof EquipmentSpec;
  /**
   * Match the item's full components, not just its id.
   *
   * Off by default so items sharing a base id share one predicate file. Turn on to tell
   * apart items
   * with the same id and different components.
   */
  exact?: boolean;
}

/** `minecraft:foo` / `#minecraft:bar` -> filesystem-safe `foo` / `bar`. */
function slugify(baseId: string): string {
  return baseId
    .replace(/^minecraft:/, "")
    .replace(/[^a-z0-9_]+/gi, "_")
    .toLowerCase();
}

/** Tiny deterministic (djb2) hash -> base36, for disambiguating exact-match slugs. */
function shortHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

/** The `zzz/holding/<slug>` predicate name for `item`, shared by spool and twine. */
export function holdingPredicateName(item: ItemValue, opts: HoldingOptions, dp: Datapack): string {
  const base = slugify(item.baseId());
  return opts.exact ? `zzz/holding/${base}_${shortHash(item.render(dp.version))}` : `zzz/holding/${base}`;
}

/**
 * Registers the holding predicate for `item` once and returns its ref.
 * Built with {@link Predicate.holding} from the same item you give.
 */
export function holdingPredicate(
  dp: Datapack,
  item: ItemValue,
  opts: HoldingOptions = {},
): PredicateRef | string {
  const name = holdingPredicateName(item, opts, dp);
  return dp.predicateDefs.has(name)
    ? `${dp.name}:${name}`
    : dp.predicate(name, Predicate.holding(item, opts.slot ?? "mainhand"));
}
