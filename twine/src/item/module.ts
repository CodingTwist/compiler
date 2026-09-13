import {
  Objective,
  Range,
  Selector,
  Trigger,
  holdingPredicate,
  usedStatCriteria,
} from "helix";
import type {
  Datapack,
  FunctionContext,
  FunctionRef,
  HoldingOptions,
  Item,
} from "helix";
import type { ConfiguredModule, DatapackModule } from "../core/module.interface";
import { defineModule } from "../core/module.decorator";

/** A behaviour body: commands emitted into a generated function. */
export type ItemBehaviour = (ctx: FunctionContext) => void;

/** The opt-in behaviours an {@link ItemModule} materialises (set by the builder). */
export interface ItemOpts {
  give: boolean;
  exact: boolean;
  held?: ItemBehaviour;
  attack?: ItemBehaviour;
  use?: ItemBehaviour;
  rightClick?: ItemBehaviour;
}

/** Filesystem-safe slug for an item's base id, e.g. `minecraft:soul_lantern` -> `soul_lantern`. */
export function itemSlug(item: Item): string {
  return item
    .baseId()
    .replace(/^minecraft:/, "")
    .replace(/[^a-z0-9_]+/gi, "_")
    .toLowerCase();
}

/**
 * Returns an `@a` selector for players holding `item`, registering its predicate once.
 *
 * Shares the predicate file with spool's `holding` plugin if both are used.
 */
export function itemHolderSelector(dp: Datapack, item: Item, opts?: HoldingOptions): Selector {
  return Selector.allPlayers().predicate(holdingPredicate(dp, item, opts));
}

/** Emit (once) the give function granting `item` to `@s`; idempotent across calls/bubbles. */
export function itemGiveFunction(dp: Datapack, item: Item, slug: string): FunctionRef {
  const name = `zzz/item/${slug}/give`;
  if (!dp.functions.has(name)) {
    dp.createFunction(name).build((ctx) => ctx.playerGive(Selector.self(), item));
  }
  return dp.getOrCreateFunction(name);
}

/** The module an `ItemBuilder` compiles to. Only attached behaviours emit anything. */
export class ItemModule implements DatapackModule {
  private heldSelector?: Selector;

  constructor(
    private readonly item: Item,
    private readonly slug: string,
    private readonly opts: ItemOpts,
  ) {}

  /** Compile to a drop-in {@link ConfiguredModule} (name = module/scoreboard id). */
  toConfigured(name: string): ConfiguredModule {
    return defineModule({ name }, this);
  }

  register(dp: Datapack): void {
    const base = `zzz/item/${this.slug}`;

    if (this.opts.give) itemGiveFunction(dp, this.item, this.slug);

    if (this.opts.attack) {
      dp.event(`${base}/on_attack`, Trigger.playerHurtEntity(this.item), this.opts.attack);
    }
    if (this.opts.use) {
      dp.event(`${base}/on_use`, Trigger.usingItem(this.item), this.opts.use);
    }
    if (this.opts.rightClick) {
      this.rightClick(dp, base, this.opts.rightClick);
    }
    if (this.opts.held) {
      this.heldSelector = itemHolderSelector(dp, this.item, { exact: this.opts.exact });
    }
  }

  onTick(ctx: FunctionContext): void {
    const held = this.opts.held;
    if (!held || !this.heldSelector) return;
    // Run the held body as each holder, at them.
    this.heldSelector.run((as) => as.atEntity(Selector.self(), held, "xyz"))(ctx);
  }

  /**
   * Wires right-click detection with the `used:<item>` statistic (the carrot-on-a-stick trick).
   *
   * Each tick, runs the body as holders whose count went up, then resets it. Gated by the holding
   * predicate so plain items don't fire. Makes its own load and tick functions; idempotent per
   * item.
   */
  private rightClick(dp: Datapack, base: string, body: ItemBehaviour): void {
    const tickName = `${base}/rc_tick`;
    if (dp.functions.has(tickName)) return;

    const rc = new Objective(`rc_${this.slug}`, usedStatCriteria(this.item));
    const holder = holdingPredicate(dp, this.item, { exact: this.opts.exact });
    const clicked = Selector.allPlayers().score(rc, Range.atLeast(1)).predicate(holder);

    dp.createFunction(`${base}/rc_load`, "load").build((ctx) => ctx.scoreInit(rc));
    dp.createFunction(tickName, "tick").build((ctx) => {
      ctx.execute().as(clicked).at(Selector.self()).run((b) => body(b));
      // Reset every player so this tick's use doesn't fire again next tick.
      rc.score(Selector.allPlayers()).set(0);
    });
  }
}
