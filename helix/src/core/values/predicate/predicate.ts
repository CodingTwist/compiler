import type { VersionProfile } from "../../../versions/profile";
import { Id } from "../id";
import type { BlockValue } from "../block";
import type { ItemValue } from "../item";
import { atLeast } from "../entity-nbt/fields";
import {
  conditionKey,
  idStr,
  renderEntitySpec,
  renderLocation,
} from "./render";
import { PredicateRef } from "./ref";
import {
  SLOTS,
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
 * predicate`,
 * instead of repeating `nbt={...}`.
 *
 *   const sleeping = dp.predicate("sleeping",
 *     Predicate.entity({ nbt: Nbt({ SleepTimer: Short(100) }) }));
 *   Selector.allPlayers().predicate(sleeping)   // @a[predicate=ns:sleeping]
 */
export class Predicate {
  private constructor(
    private readonly builder: (v: VersionProfile) => PredicateJson,
  ) {}

  /** The condition JSON for this predicate, with embedded values rendered for `version`. */
  toJson(version: VersionProfile): PredicateJson {
    return this.builder(version);
  }

  // ---- leaf conditions -----------------------------------------------------

  /** `entity_properties` - match `who` (default the looked-at entity) against typed properties. */
  static entity(
    spec: EntityPredicateSpec,
    who: EntityTarget = "this",
  ): Predicate {
    return new Predicate((v) => ({
      ...conditionKey(v, "entity_properties"),
      entity: who,
      predicate: renderEntitySpec(spec, v),
    }));
  }

  /** `entity_scores` - objective bounds on `who`'s scores. */
  static scores(
    scores: Record<string, ScoreBound>,
    who: EntityTarget = "this",
  ): Predicate {
    return new Predicate((v) => {
      const out: PredicateJson = {};
      for (const [obj, b] of Object.entries(scores)) {
        out[obj] = typeof b === "number" ? b : { min: b.min, max: b.max };
      }
      return { ...conditionKey(v, "entity_scores"), entity: who, scores: out };
    });
  }

  /** `block_state_property` - the block being checked plus optional blockstate values. */
  static blockState(
    block: string | BlockValue,
    properties?: Record<string, string>,
  ): Predicate {
    return new Predicate((v) => {
      const id = typeof block === "string" ? idStr(block) : block.render();
      const hasProps = properties && Object.keys(properties).length;
      if (atLeast(v, "26.3")) {
        return {
          ...conditionKey(v, "match_block"),
          blocks: id,
          ...(hasProps ? { state: properties } : {}),
        };
      }
      const out: PredicateJson = {
        ...conditionKey(v, "block_state_property"),
        block: id,
      };
      if (hasProps) out.properties = properties;
      return out;
    });
  }

  /** `location_check` - facts about the location being evaluated. */
  static location(spec: LocationSpec): Predicate {
    return new Predicate((v) => ({
      ...conditionKey(v, "location_check"),
      predicate: renderLocation(spec, v),
    }));
  }

  /**
   * `match_tool`: passes when the tool matches `item`. For loot and mining; use
   * `Selector.holding(item)` for held items.
   */
  static matchTool(item: ItemValue): Predicate {
    return new Predicate((v) => ({
      ...conditionKey(v, "match_tool"),
      predicate: item.toPredicate(v),
    }));
  }

  /**
   * Matches an entity holding `item` in `slot` (default main hand). Replaces
   * `nbt={SelectedItem:…}` scans.
   */
  static holding(
    item: ItemValue,
    slot: keyof EquipmentSpec = "mainhand",
    who: EntityTarget = "this",
  ): Predicate {
    return Predicate.entity({ equipment: { [slot]: item } }, who);
  }

  /**
   * Matches an entity carrying `item` anywhere in the slot range (default whole inventory).
   */
  static carrying(
    item: ItemValue,
    range: SlotRange = SLOTS.INVENTORY,
    who: EntityTarget = "this",
  ): Predicate {
    return Predicate.entity({ slots: { [range]: item } }, who);
  }

  /** `weather_check`. */
  static weather(spec: { raining?: boolean; thundering?: boolean }): Predicate {
    return new Predicate((v) => {
      const out: PredicateJson = { ...conditionKey(v, "weather_check") };
      if (spec.raining !== undefined) out.raining = spec.raining;
      if (spec.thundering !== undefined) out.thundering = spec.thundering;
      return out;
    });
  }

  /** `random_chance` - passes with probability `chance` (0..1). */
  static randomChance(chance: number): Predicate {
    return new Predicate((v) => ({
      ...conditionKey(v, "random_chance"),
      chance,
    }));
  }

  /** `reference` - defer to another predicate by id. */
  static reference(ref: PredicateRef | Id | string): Predicate {
    const name =
      ref instanceof PredicateRef
        ? ref.id
        : typeof ref === "string"
          ? Id(ref).render()
          : ref.render();
    // 26.3 dropped `reference`; an id string is a valid term instead.
    return new Predicate((v) =>
      atLeast(v, "26.3")
        ? { ...conditionKey(v, "all_of"), terms: [name] }
        : { ...conditionKey(v, "reference"), name },
    );
  }

  // ---- combinators ---------------------------------------------------------

  /** `all_of` - passes only if every term passes (logical AND). */
  static all(...terms: Predicate[]): Predicate {
    return new Predicate((v) => ({
      ...conditionKey(v, "all_of"),
      terms: terms.map((t) => t.toJson(v)),
    }));
  }

  /** `any_of` - passes if any term passes (logical OR). */
  static any(...terms: Predicate[]): Predicate {
    return new Predicate((v) => ({
      ...conditionKey(v, "any_of"),
      terms: terms.map((t) => t.toJson(v)),
    }));
  }

  /** `inverted` - passes iff `term` fails (logical NOT). */
  static not(term: Predicate): Predicate {
    return new Predicate((v) => ({
      ...conditionKey(v, "inverted"),
      term: term.toJson(v),
    }));
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
