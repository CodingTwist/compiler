import type { Datapack } from "../ir/datapack";
import type { ItemValue } from "./item";
import { Predicate, PredicateRef, type EquipmentSpec } from "./predicate";

/** Options for {@link holdingPredicate}. */
export interface HoldingOptions {
  /** Equipment slot to test (default `mainhand` - a player's selected item). */
  slot?: keyof EquipmentSpec;
  /**
   * Match the item's **full identity** (components/NBT), not just its base id.
   *
   * Off by default: the predicate keys on the base id alone (`zzz/holding/<id>`),
   * which is cheap and lets every definition of the same base item share one file
   * - but two items with the same base id and *different* components would collide
   * on that name. Set `exact: true` to fold a hash of the item's full rendered
   * stack into the slug, so distinct components get distinct predicates (matching
   * the exact item, at the cost of one predicate file per variant).
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

/**
 * The canonical `zzz/holding/<slug>` name for a held-`item` predicate - the one
 * place the slug convention lives, so every consumer (spool's `Selector.holding`,
 * twine's behavioural items, any bubble-style mechanism) names the file the same
 * way and shares it. base-id only by default; component-aware when `exact` is set
 * (see {@link HoldingOptions.exact}). `version` disambiguates the exact-match hash
 * and is fixed for a build.
 */
export function holdingPredicateName(item: ItemValue, opts: HoldingOptions, dp: Datapack): string {
  const base = slugify(item.baseId());
  return opts.exact ? `zzz/holding/${base}_${shortHash(item.render(dp.version))}` : `zzz/holding/${base}`;
}

/**
 * Register (once) the holding predicate for `item` on `dp` and return its ref -
 * the shared held-detection primitive. Built from the same {@link ItemValue} you
 * give, via {@link Predicate.holding}, so an item is detected exactly the way it
 * was granted. Idempotent: re-registering the same name with a fresh `Predicate`
 * would throw, so an already-seen item reuses its file. The slug + dedup live here
 * (not duplicated per package) so spool and twine can't drift apart.
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
