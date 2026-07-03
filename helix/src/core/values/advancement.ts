import { VersionProfile } from "../../versions/profile";
import { ItemValue } from "./item";
import { Predicate } from "./predicate";

/** JSON object Minecraft reads as one advancement criterion (`{ trigger, conditions? }`). */
export type CriterionJson = { trigger: string; conditions?: Record<string, unknown> };

/**
 * One advancement **trigger** with its conditions, built from typed concepts (no
 * hand-written JSON). The conditions are sourced from the same {@link ItemValue}
 * you'd `give`, so an item's "fires when used/attacked with" check matches the
 * exact item that was granted - one definition, like {@link Predicate}.
 *
 *   Trigger.usingItem(wand)          // right-click / use of the item
 *   Trigger.playerHurtEntity(wand)   // attacked something while holding it
 */
export class Trigger {
  private constructor(private readonly builder: (v: VersionProfile) => CriterionJson) {}

  /** The criterion JSON, with embedded item predicates rendered for `version`. */
  toJson(version: VersionProfile): CriterionJson {
    return this.builder(version);
  }

  /**
   * `minecraft:using_item` - fires while the player is using `item` (right-click
   * on a usable item). The `item` condition is the item's own predicate form.
   */
  static usingItem(item: ItemValue): Trigger {
    return new Trigger((v) => ({
      trigger: "minecraft:using_item",
      conditions: { item: item.toPredicate(v) },
    }));
  }

  /**
   * `minecraft:player_hurt_entity` - fires when the player damages an entity
   * while holding `item` in `slot` (default main hand). The held-item gate reuses
   * {@link Predicate.holding}, so "attacked with this item" matches the same way
   * "holding this item" does.
   */
  static playerHurtEntity(item: ItemValue, slot: "mainhand" | "offhand" = "mainhand"): Trigger {
    return new Trigger((v) => ({
      trigger: "minecraft:player_hurt_entity",
      conditions: { player: [Predicate.holding(item, slot).toJson(v)] },
    }));
  }

  /** Escape hatch: a trigger by id with already-built conditions. */
  static of(trigger: string, conditions?: Record<string, unknown>): Trigger {
    return new Trigger(() => (conditions ? { trigger, conditions } : { trigger }));
  }
}

/**
 * A registerable advancement, built from typed {@link Trigger}s plus an optional
 * **reward function**. Renders to the JSON written into
 * `data/<ns>/<advancement folder>/<name>.json` (via {@link Datapack.advancement}).
 *
 * The common shape is a *hidden trigger* advancement - no `display`, no `parent`,
 * one criterion, a `rewards.function`. The reward function typically runs some
 * behaviour and then `advancement revoke @s only <this>` to re-arm, giving an
 * event handler that fires once per occurrence.
 *
 *   dp.advancement("zzz/item/wand/on_attack",
 *     Advancement().criterion("trigger", Trigger.playerHurtEntity(wand))
 *       .reward("mypack:zzz/item/wand/on_attack"));
 */
export class AdvancementDef {
  private readonly criteria: Record<string, Trigger> = {};
  private rewardFn?: string;

  /** Add a named criterion (its trigger). Default requirements (all criteria) apply. */
  criterion(name: string, trigger: Trigger): this {
    this.criteria[name] = trigger;
    return this;
  }

  /** Set `rewards.function` to the function resource id (`<ns>:name`). */
  reward(functionId: string): this {
    this.rewardFn = functionId;
    return this;
  }

  /** The advancement JSON, with embedded values rendered for `version`. */
  toJson(version: VersionProfile): Record<string, unknown> {
    const criteria: Record<string, CriterionJson> = {};
    for (const [name, trigger] of Object.entries(this.criteria)) {
      criteria[name] = trigger.toJson(version);
    }
    const out: Record<string, unknown> = { criteria };
    if (this.rewardFn !== undefined) out.rewards = { function: this.rewardFn };
    return out;
  }
}
