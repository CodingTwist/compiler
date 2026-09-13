import { Selector, holdingPredicate } from "helix";
import type { Datapack, HoldingOptions, Item } from "helix";
import type { KitPlugin } from "../../plugin";

// Declares `.holding()` for the type checker; the plugin's `install()` adds it at runtime.
declare module "helix" {
  interface Selector {
    /**
     * Matches entities holding `item` in their main hand.
     *
     * Uses a predicate file built from the same {@link Item} you give, instead of an NBT
     * scan.
     * `{ exact: true }` also matches components; `slot` checks another slot. Idempotent.
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
      // helix's `holdingPredicate` names and dedupes the file, so twine's items share it.
      return this.predicate(holdingPredicate(dp, item, opts));
    };
  },
};
