import {
  AdvancementDef,
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
import type { ConfiguredModule, DatapackModule } from "./module.interface";
import { defineModule } from "./module.decorator";

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
 * Register (once) the holding predicate for `item` and return an `@a` selector
 * matching whoever holds it - the held-detection primitive shared by
 * {@link ItemModule}'s held sweep and exposed via `ItemBuilder.holderSelector`
 * so callers with their own tick loop (e.g. a per-area mechanism) can refine it
 * (`.volume(...)`) and detect holders the same way the item is given. The slug +
 * register-once dedup live in helix's `holdingPredicate`, so this names the file
 * the same way spool's `holding` plugin does and shares it if both are present.
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

/**
 * The drop-in {@link DatapackModule} an `ItemBuilder` compiles to. It owns nothing
 * at construction time; everything is materialised in `register(dp)` (give
 * function, attack/use advancements + self-revoking reward functions) and
 * `onTick(ctx)` (the held sweep), and only for behaviours that were attached.
 */
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
      this.event(dp, `${base}/on_attack`, Trigger.playerHurtEntity(this.item), this.opts.attack);
    }
    if (this.opts.use) {
      this.event(dp, `${base}/on_use`, Trigger.usingItem(this.item), this.opts.use);
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
    // Run the held body as each holder, anchored at them (so @s is the holder and
    // positional ops land on the holder).
    this.heldSelector.run((as) => as.atEntity(Selector.self(), held, "xyz"))(ctx);
  }

  /**
   * Wire reliable right-click detection via the `used:<item>` statistic (the
   * standard carrot-/warped-fungus-on-a-stick technique). A per-item objective
   * mirrors the use count; each tick we run the body as (and at) every holder
   * whose count went `>= 1` since last tick - gated by this item's holding
   * predicate so only *this* custom item fires, not any plain stick - then reset
   * the objective to 0. Its own objective (keyed on the slug) means two
   * right-click items never reset each other's counter.
   *
   * Self-contained: it creates its own `load` (objective init) and `tick` (scan +
   * reset) functions, so it works whether the item was wired via `register()` or
   * `toModule()`. Idempotent on the slug.
   */
  private rightClick(dp: Datapack, base: string, body: ItemBehaviour): void {
    const tickName = `${base}/rc_tick`;
    if (dp.functions.has(tickName)) return;

    const rc = new Objective(`rc_${this.slug}`, usedStatCriteria(this.item));
    const holder = holdingPredicate(dp, this.item, { exact: this.opts.exact });
    const clicked = Selector.allPlayers().score(rc, new Range(1, undefined)).predicate(holder);

    dp.createFunction(`${base}/rc_load`, "load").build((ctx) => ctx.scoreInit(rc));
    dp.createFunction(tickName, "tick").build((ctx) => {
      ctx.execute().as(clicked).at(Selector.self()).run((b) => body(b));
      // Reset every player (cheap) so a use registered this tick can't linger and
      // re-fire next tick. `set 0` behaves like `reset` here: the stat re-mirrors
      // its (>=1) total on the next use.
      ctx.scoreSet(rc.score(Selector.allPlayers()).set(0));
    });
  }

  /**
   * Wire one event behaviour: a self-revoking advancement. The reward function
   * runs the user body, then `advancement revoke @s only <this>` so the
   * advancement re-arms and fires again on the next occurrence.
   */
  private event(dp: Datapack, name: string, trigger: Trigger, body: ItemBehaviour): void {
    const reward = dp.createFunction(name);
    const advId = dp.advancement(
      name,
      new AdvancementDef().criterion("trigger", trigger).reward(`${dp.name}:${name}`),
    );
    reward.build((ctx) => {
      body(ctx);
      ctx.advancement().revokeOnly(Selector.self(), advId);
    });
  }
}
