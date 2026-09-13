import type { Datapack, FunctionRef, Item, Selector } from "helix";
import type { ConfiguredModule } from "../core/module.interface";
import {
  ItemModule,
  itemGiveFunction,
  itemHolderSelector,
  itemSlug,
  type ItemBehaviour,
  type ItemOpts,
} from "./module";

export type { ItemBehaviour } from "./module";

/**
 * Builds a custom item with behaviours. Only attached behaviours emit anything.
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
   * Matches this item by its full components, not just its base id.
   *
   * Use when two items share a base id, e.g. a custom lantern and a plain one.
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
   * Runs `body` as the player when they use the item (`minecraft:using_item`).
   *
   * Only fires for items with a use action (food, bow, shield...). For others use
   * {@link onRightClick}.
   */
  onUse(body: ItemBehaviour): this {
    this.useFn = body;
    return this;
  }

  /**
   * Runs `body` as and at the holder on right-click, via the `used:<item>` statistic.
   *
   * Works for items {@link onUse} can't see. Costs a tick command and an objective.
   */
  onRightClick(body: ItemBehaviour): this {
    this.rightClickFn = body;
    return this;
  }

  /** An `@a` selector matching players holding this item, for your own tick loops. */
  holderSelector(dp: Datapack): Selector {
    return itemHolderSelector(dp, this.item, { exact: this.exactMatchFlag });
  }

  /** Emits the give function and returns it. Idempotent. */
  registerGive(dp: Datapack): FunctionRef {
    this.giveFn = true;
    return itemGiveFunction(dp, this.item, itemSlug(this.item));
  }

  /**
   * Emits the give function and `onUse`/`onAttack` advancements directly into `dp`, without a
   * module.
   *
   * Returns the give function if `give()` was set. Throws if `onHeldTick` is set, since that needs
   * {@link toModule}.
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
