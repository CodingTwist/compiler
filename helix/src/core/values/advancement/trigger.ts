// `Trigger`: one advancement trigger with typed conditions, shared with predicate files.
import { VersionProfile } from "../../../versions/profile";
import { BlockValue } from "../block";
import { Id } from "../id";
import { ItemValue } from "../item";
import { EntityPredicateSpec, LocationSpec, Predicate } from "../predicate";

/** JSON object Minecraft reads as one advancement criterion (`{ trigger, conditions? }`). */
export type CriterionJson = { trigger: string; conditions?: Record<string, unknown> };

function idStr(x: string | Id): string {
  return typeof x === "string" ? Id(x).render() : x.render();
}

function blockStr(x: string | BlockValue): string {
  return typeof x === "string" ? Id(x).render() : x.render();
}

/**
 * The `entity_properties` body for `spec`, reusing {@link Predicate.entity} so triggers
 * match predicate files.
 */
function entityPredicateJson(
  spec: EntityPredicateSpec,
  version: VersionProfile,
): Record<string, unknown> {
  const json = Predicate.entity(spec, "this").toJson(version) as { predicate: Record<string, unknown> };
  return json.predicate;
}

/**
 * One advancement trigger with typed conditions.
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

  /** `minecraft:using_item`: fires while the player uses `item`. */
  static usingItem(item: ItemValue): Trigger {
    return new Trigger((v) => ({
      trigger: "minecraft:using_item",
      conditions: { item: item.toPredicate(v) },
    }));
  }

  /**
   * `minecraft:player_hurt_entity`: fires when the player damages an entity while holding
   * `item`.
   */
  static playerHurtEntity(item: ItemValue, slot: "mainhand" | "offhand" = "mainhand"): Trigger {
    return new Trigger((v) => ({
      trigger: "minecraft:player_hurt_entity",
      conditions: { player: [Predicate.holding(item, slot).toJson(v)] },
    }));
  }

  /**
   * `minecraft:location`: fires when the player is at a location matching `spec`.
   * Shares {@link LocationSpec} with predicates.
   */
  static location(spec: LocationSpec): Trigger {
    return new Trigger((v) => ({
      trigger: "minecraft:location",
      conditions: { player: entityPredicateJson({ location: spec }, v) },
    }));
  }

  /** `minecraft:enter_block` - fires when the player steps into `block`. */
  static enterBlock(block: string | BlockValue): Trigger {
    return new Trigger(() => ({
      trigger: "minecraft:enter_block",
      conditions: { block: blockStr(block) },
    }));
  }

  /** `minecraft:consume_item` - fires when the player eats/drinks `item`. */
  static consumeItem(item: ItemValue): Trigger {
    return new Trigger((v) => ({
      trigger: "minecraft:consume_item",
      conditions: { item: item.toPredicate(v) },
    }));
  }

  /**
   * `minecraft:player_killed_entity`: fires on killing an entity matching `spec` (any if
   * omitted).
   */
  static playerKilledEntity(spec?: EntityPredicateSpec): Trigger {
    return new Trigger((v) => ({
      trigger: "minecraft:player_killed_entity",
      ...(spec ? { conditions: { entity: entityPredicateJson(spec, v) } } : {}),
    }));
  }

  /** `minecraft:placed_block`: fires when the player places `block`, optionally at `at`. */
  static placedBlock(block: string | Id | BlockValue, at?: LocationSpec): Trigger {
    return new Trigger((v) => {
      const conditions: Record<string, unknown> = { block: typeof block === "string" ? idStr(block) : block.render() };
      if (at) conditions.location = [Predicate.location(at).toJson(v)];
      return { trigger: "minecraft:placed_block", conditions };
    });
  }

  /** `minecraft:inventory_changed` - fires on any inventory change. */
  static inventoryChanged(): Trigger {
    return new Trigger(() => ({ trigger: "minecraft:inventory_changed" }));
  }

  /** `minecraft:impossible` - never fires on its own; grant it via `/advancement grant`. */
  static impossible(): Trigger {
    return new Trigger(() => ({ trigger: "minecraft:impossible" }));
  }

  /** Escape hatch: a trigger by id with already-built conditions. */
  static of(trigger: string, conditions?: Record<string, unknown>): Trigger {
    return new Trigger(() => (conditions ? { trigger, conditions } : { trigger }));
  }
}
