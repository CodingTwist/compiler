import { Selector, holdingPredicate } from "helix";
import type { Datapack, HoldingOptions, Item } from "helix";
import type { KitPlugin } from "../../plugin";

// Importing this module makes `.holding()` visible to the type-checker; the
// runtime method isn't installed until the `holding` plugin's `install()` runs
// (via `installKit`/`Kit`).
declare module "helix" {
  interface Selector {
    /**
     * Restrict to entities holding `item` in their selected (main-hand) slot.
     *
     * Compiles to an engine-evaluated, referenceable **predicate** -
     * `@s[...,predicate=<ns>:zzz/holding/<item>]`, where the predicate file is an
     * `entity_properties` check on the `mainhand` equipment slot - rather than an
     * inline `nbt={SelectedItem:{id:...}}` scan. The predicate body is built from
     * the same {@link Item} you'd `give` (its `toPredicate(...)`), so the item is
     * defined once and matched the same way it was granted.
     *
     * Registering the predicate needs the {@link Datapack}, hence the `dp` arg.
     * Matching by base id is the default; pass `{ exact: true }` to match the
     * item's full components too (and `slot` to test a slot other than mainhand).
     * Idempotent: the same item+options registers one shared file.
     */
    holding(dp: Datapack, item: Item, opts?: HoldingOptions): this;
  }
}

export const holding: KitPlugin = {
  name: "holding",
  install() {
    Selector.prototype.holding = function (
      this: Selector,
      dp: Datapack,
      item: Item,
      opts?: HoldingOptions,
    ): Selector {
      // Slug + register-once dedup live in helix's `holdingPredicate`, so this
      // plugin and twine's behavioural items name the file identically and share it.
      return this.predicate(holdingPredicate(dp, item, opts));
    };
  },
};
