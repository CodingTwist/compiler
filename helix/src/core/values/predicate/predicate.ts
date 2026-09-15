import type { VersionProfile } from "../../../versions/profile";
import type { Id } from "../id";
import type { BlockValue } from "../block";
import type { ItemValue } from "../item";
import { conditionKey } from "./render/common";
import type { PredicateRef } from "./ref";
import * as loot from "./conditions/loot";
import * as world from "./conditions/world";
import {
  SLOTS,
  type Bound,
  type DamageSourceSpec,
  type EntityPredicateSpec,
  type EntityTarget,
  type EquipmentSpec,
  type LocationSpec,
  type PredicateJson,
  type ScoreBound,
  type SlotRange,
} from "./types";

/**
 * A predicate condition tree, registered with {@link Datapack.predicate}.
 *
 * Write an entity check once (NBT included) and reference it from selectors or `execute if
 * predicate`, instead of repeating `nbt={...}`.
 *
 *   const sleeping = dp.predicate("sleeping",
 *     Predicate.entity({ nbt: Nbt({ SleepTimer: Short(100) }) }));
 *   Selector.allPlayers().predicate(sleeping)   // @a[predicate=ns:sleeping]
 */
export class Predicate {
  private constructor(private readonly builder: (v: VersionProfile) => PredicateJson) {}

  /** The condition JSON for this predicate, with embedded values rendered for `version`. */
  toJson(version: VersionProfile): PredicateJson {
    return this.builder(version);
  }

  // ---- entities ------------------------------------------------------------

  /** `entity_properties` - match `who` (default the looked-at entity) against typed properties. */
  static entity(spec: EntityPredicateSpec, who: EntityTarget = "this"): Predicate {
    return new Predicate(loot.entity(spec, who));
  }

  /** `entity_scores` - objective bounds on `who`'s scores. */
  static scores(scores: Record<string, ScoreBound>, who: EntityTarget = "this"): Predicate {
    return new Predicate(loot.scores(scores, who));
  }

  /** Matches an entity holding `item` in `slot` (default main hand). Replaces `nbt={SelectedItem:…}`. */
  static holding(
    item: ItemValue,
    slot: keyof EquipmentSpec = "mainhand",
    who: EntityTarget = "this",
  ): Predicate {
    return Predicate.entity({ equipment: { [slot]: item } }, who);
  }

  /** Matches an entity carrying `item` anywhere in the slot range (default whole inventory). */
  static carrying(
    item: ItemValue,
    range: SlotRange = SLOTS.INVENTORY,
    who: EntityTarget = "this",
  ): Predicate {
    return Predicate.entity({ slots: { [range]: item } }, who);
  }

  // ---- world ---------------------------------------------------------------

  /** `value_check` - passes when fixed score holder `name`'s `objective` score is in `range`. */
  static scoreValue(name: string, objective: string, range: ScoreBound): Predicate {
    return new Predicate(world.scoreValue(name, objective, range));
  }

  /** `block_state_property` - the block being checked plus optional blockstate values. */
  static blockState(block: string | BlockValue, properties?: Record<string, string>): Predicate {
    return new Predicate(world.blockState(block, properties));
  }

  /** `location_check` - facts about the location being evaluated, optionally `offset` from it. */
  static location(spec: LocationSpec, offset?: [number, number, number]): Predicate {
    return new Predicate(world.location(spec, offset));
  }

  /** `weather_check`. */
  static weather(spec: { raining?: boolean; thundering?: boolean }): Predicate {
    return new Predicate(world.weather(spec));
  }

  /** `time_check` - the clock's tick, modulo `period` (24000 for time of day). `clock` is required on 26.1+. */
  static timeCheck(spec: { value: Bound; period?: number; clock?: string | Id }): Predicate {
    return new Predicate(world.timeCheck(spec));
  }

  /** `environment_attribute_check` - an environment attribute's value at the location. 26.1+. */
  static environmentAttribute(attribute: string | Id, value: unknown): Predicate {
    return new Predicate(world.environmentAttribute(attribute, value));
  }

  /** `random_chance` - passes with probability `chance` (0..1). */
  static randomChance(chance: number): Predicate {
    return new Predicate(world.randomChance(chance));
  }

  // ---- loot context --------------------------------------------------------

  /** `match_tool`: the tool matches `item`. For loot and mining; use `Selector.holding(item)` for held items. */
  static matchTool(item: ItemValue): Predicate {
    return new Predicate(world.matchTool(item));
  }

  /** `killed_by_player` - a player dealt the killing blow, or didn't with `inverse`. */
  static killedByPlayer(inverse?: boolean): Predicate {
    return new Predicate(loot.killedByPlayer(inverse));
  }

  /** `survives_explosion` - passes with `1 / explosion radius`, as block drops do. */
  static survivesExplosion(): Predicate {
    return new Predicate(loot.survivesExplosion());
  }

  /** `table_bonus` - the chance for each level of `enchantment` on the tool, level 0 first. */
  static tableBonus(enchantment: string | Id, chances: number[]): Predicate {
    return new Predicate(loot.tableBonus(enchantment, chances));
  }

  /** `damage_source_properties` - the damage that caused the loot. */
  static damageSource(spec: DamageSourceSpec): Predicate {
    return new Predicate(loot.damageSource(spec));
  }

  /** `enchantment_active_check` - only inside enchantment effects. 1.21+. */
  static enchantmentActive(active: boolean): Predicate {
    return new Predicate(loot.enchantmentActive(active));
  }

  /**
   * `chance` plus `perLevel` per level of `enchantment` on the killer's weapon.
   *
   * Before 1.21 only looting works (`random_chance_with_looting`).
   */
  static randomChanceWithBonus(enchantment: string | Id, chance: number, perLevel: number): Predicate {
    return new Predicate(loot.randomChanceWithBonus(enchantment, chance, perLevel));
  }

  /** `reference` - defer to another predicate by id. */
  static reference(ref: PredicateRef | Id | string): Predicate {
    return new Predicate(world.reference(ref));
  }

  // ---- combinators ---------------------------------------------------------

  /** `all_of` - passes only if every term passes (logical AND). */
  static all(...terms: Predicate[]): Predicate {
    return new Predicate((v) => ({ ...conditionKey(v, "all_of"), terms: terms.map((t) => t.toJson(v)) }));
  }

  /** `any_of` - passes if any term passes (logical OR). */
  static any(...terms: Predicate[]): Predicate {
    return new Predicate((v) => ({ ...conditionKey(v, "any_of"), terms: terms.map((t) => t.toJson(v)) }));
  }

  /** `inverted` - passes iff `term` fails (logical NOT). */
  static not(term: Predicate): Predicate {
    return new Predicate((v) => ({ ...conditionKey(v, "inverted"), term: term.toJson(v) }));
  }

  /** This predicate inverted. */
  not(): Predicate {
    return Predicate.not(this);
  }

  /** This predicate AND-ed with more terms. */
  and(...terms: Predicate[]): Predicate {
    return Predicate.all(this, ...terms);
  }

  /** This predicate OR-ed with more terms. */
  or(...terms: Predicate[]): Predicate {
    return Predicate.any(this, ...terms);
  }
}
