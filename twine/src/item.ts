import type { Datapack, FunctionRef, Item, Selector } from "helix";
import type { ConfiguredModule } from "./module.interface";
import {
  ItemModule,
  itemGiveFunction,
  itemHolderSelector,
  itemSlug,
  type ItemBehaviour,
  type ItemOpts,
} from "./item-runtime";

export type { ItemBehaviour } from "./item-runtime";

/**
 * Fluent builder for a **custom item that does things**. Wrap the same {@link Item}
 * you'd `give` (the single source of truth for its data) and attach opt-in
 * behaviours; `toModule(name)` turns it into a drop-in {@link ConfiguredModule}
 * you list in a parent module's `imports`. Only attached behaviours emit anything.
 *
 *   const wand = defineItem(Item.STICK.named("Frost Wand").modelData(7))
 *     .give()
 *     .onAttack((ctx) => ctx.effect().give(Selector.self(), "slowness", 5))
 *     .onHeldTick((ctx) => ctx.particle(...));
 *
 *   @Module({ name: "courtyard", imports: [wand.toModule("frost_wand")] })
 */
export class ItemBuilder {
  private giveFn = false;
  private exactMatchFlag = false;
  private heldFn?: ItemBehaviour;
  private attackFn?: ItemBehaviour;
  private useFn?: ItemBehaviour;
  private rightClickFn?: ItemBehaviour;

  constructor(private readonly item: Item) {}

  /**
   * Detect this item by its **full identity** (components/NBT), not just its base
   * id. By default held-detection keys on the base id alone (cheap, and shared
   * with any other definition of the same base item); call this when two items
   * share a base id but must be told apart - e.g. a custom-modelled lantern vs a
   * plain one. See {@link HoldingOptions.exact}.
   */
  matchExact(): this {
    this.exactMatchFlag = true;
    return this;
  }

  /** Emit a `/function <ns>:zzz/item/<slug>/give` that grants the fully-built item to `@s`. */
  give(): this {
    this.giveFn = true;
    return this;
  }

  /** Run `body` every tick, as (and at) each player holding the item. */
  onHeldTick(body: ItemBehaviour): this {
    this.heldFn = body;
    return this;
  }

  /** Run `body` (as the attacker) when the player damages an entity while holding the item. */
  onAttack(body: ItemBehaviour): this {
    this.attackFn = body;
    return this;
  }

  /**
   * Run `body` (as the user) when the player **uses** the item, via a
   * `minecraft:using_item` advancement. Fires for items the game treats as "in
   * use" on right-click (food, bow, shield, spyglass, …); for items with *no* use
   * action (a plain stick, a carrot-on-a-stick), it may never fire - reach for
   * {@link onRightClick} instead.
   */
  onUse(body: ItemBehaviour): this {
    this.useFn = body;
    return this;
  }

  /**
   * Run `body` (as and at the holder) on **right-click**, detected via the
   * `used:<item>` statistic - the reliable carrot-/warped-fungus-on-a-stick
   * technique that works for items `onUse` can't see. Costs one tick command + a
   * scoreboard objective; gated by this item's holding predicate so only this
   * custom item triggers. Use {@link matchExact} when several custom items share
   * the same base id.
   */
  onRightClick(body: ItemBehaviour): this {
    this.rightClickFn = body;
    return this;
  }

  /**
   * The held-detection selector: an `@a` matching whoever is holding this item,
   * via its (once-)registered holding predicate. For consumers that drive their
   * own tick loop instead of `onHeldTick` - refine it (`.volume(...)`) and detect
   * holders the same way the item is defined/given. Needs the {@link Datapack} to
   * register the predicate.
   */
  holderSelector(dp: Datapack): Selector {
    return itemHolderSelector(dp, this.item, { exact: this.exactMatchFlag });
  }

  /**
   * Emit the give function and return its {@link FunctionRef}, for consumers that
   * wire it up directly (e.g. `register(dp)`) rather than via {@link toModule}.
   * Idempotent - many callers share one file.
   */
  registerGive(dp: Datapack): FunctionRef {
    this.giveFn = true;
    return itemGiveFunction(dp, this.item, itemSlug(this.item));
  }

  /**
   * Materialise this item's **event** behaviours straight into `dp` - the give
   * function plus the `onUse`/`onAttack` self-revoking advancements - for
   * consumers wiring an item without the module tree (the full sibling of
   * {@link registerGive}). Returns the give {@link FunctionRef} when `give()` was
   * set, else `undefined`.
   *
   * `onHeldTick` is **not** wired here: the held sweep needs the framework's tick
   * loop, which only {@link toModule} (a module in the tree) provides. Calling
   * this with a held behaviour attached throws, so the drop isn't silent.
   */
  register(dp: Datapack): FunctionRef | undefined {
    if (this.heldFn) {
      throw new Error(
        "ItemBuilder.register() can't wire onHeldTick (it needs the module tick loop) - use .toModule(name) in a parent module's imports instead.",
      );
    }
    this.module({ held: false }).register(dp);
    return this.giveFn ? itemGiveFunction(dp, this.item, itemSlug(this.item)) : undefined;
  }

  /** Compile to a drop-in {@link ConfiguredModule} (name = module/scoreboard id). */
  toModule(name: string): ConfiguredModule {
    return this.module({ held: true }).toConfigured(name);
  }

  /** Build the {@link ItemModule} from the attached behaviours (held wired only in the tree). */
  private module({ held }: { held: boolean }): ItemModule {
    const opts: ItemOpts = {
      give: this.giveFn,
      exact: this.exactMatchFlag,
      held: held ? this.heldFn : undefined,
      attack: this.attackFn,
      use: this.useFn,
      rightClick: this.rightClickFn,
    };
    return new ItemModule(this.item, itemSlug(this.item), opts);
  }
}

/** Start a custom-item definition from the item's data. */
export function defineItem(item: Item): ItemBuilder {
  return new ItemBuilder(item);
}
