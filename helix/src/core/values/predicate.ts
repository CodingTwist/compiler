import { VersionProfile } from "../../versions/profile";
import { Nbt } from "./nbt";
import { Id } from "./id";
import { BlockValue } from "./block";
import { ItemValue } from "./item";
import { CommandValue } from "./value";

/**
 * A scoreboard bound in an `entity_scores` predicate: an exact int, or an
 * inclusive `{min,max}` range (either end optional).
 */
export type ScoreBound = number | { min?: number; max?: number };

/** Which entity in the evaluation context a check runs against. */
export type EntityTarget =
  | "this"
  | "killer"
  | "direct_killer"
  | "killer_player"
  | "attacker"
  | (string & {});

/** The boolean state flags an `EntityPredicate` can assert. */
export interface EntityFlags {
  is_on_fire?: boolean;
  is_sneaking?: boolean;
  is_sprinting?: boolean;
  is_swimming?: boolean;
  is_baby?: boolean;
}

/** A 1-D inclusive bound for a position/coordinate check. */
export type Bound = number | { min?: number; max?: number };

/** Equipment slots an `EntityPredicate.equipment` can match, each an {@link ItemValue}. */
export interface EquipmentSpec {
  mainhand?: ItemValue;
  offhand?: ItemValue;
  head?: ItemValue;
  chest?: ItemValue;
  legs?: ItemValue;
  feet?: ItemValue;
  body?: ItemValue;
}

/** Location facts an `EntityPredicate.location` / `location_check` can assert. */
export interface LocationSpec {
  /** Biome id, e.g. `"minecraft:plains"`. */
  biome?: string | Id;
  /** Dimension id, e.g. `"minecraft:the_nether"`. */
  dimension?: string | Id;
  /** Structure id. */
  structure?: string | Id;
  /** The block at the location (id or tag, plus optional state/nbt). */
  block?: string | BlockValue;
  /** Coordinate bounds (`x`/`y`/`z`). */
  position?: { x?: Bound; y?: Bound; z?: Bound };
}

/**
 * The typed shape of an `EntityPredicate` - the body of an
 * `entity_properties` check. Every field is optional and only emitted when set.
 * `nbt` is the "over NBT" hook: write the NBT condition once as a typed {@link Nbt}
 * value and it renders version-aware into the predicate's `nbt` string.
 */
export interface EntityPredicateSpec {
  /** Entity type id or tag, e.g. `"minecraft:zombie"` / `"#minecraft:skeletons"`. */
  type?: string | Id;
  /** Raw NBT match (SNBT). Use a typed {@link Nbt} so embedded values render version-aware. */
  nbt?: Nbt;
  /** Team name. */
  team?: string;
  /** Boolean state flags. */
  flags?: EntityFlags;
  /** Item match per equipment slot - each built from the same {@link ItemValue} you'd `give`. */
  equipment?: EquipmentSpec;
  /** Where the entity is. */
  location?: LocationSpec;
  /** What the entity is riding (a nested entity predicate). */
  vehicle?: EntityPredicateSpec;
  /** What is riding the entity (a nested entity predicate). */
  passenger?: EntityPredicateSpec;
}

/** JSON object Minecraft reads as one predicate condition. */
export type PredicateJson = Record<string, unknown>;

function bound(b: Bound): unknown {
  return typeof b === "number" ? b : { min: b.min, max: b.max };
}

function idStr(x: string | Id): string {
  return typeof x === "string" ? Id(x).render() : x.render();
}

function renderLocation(spec: LocationSpec, _version: VersionProfile): PredicateJson {
  const out: PredicateJson = {};
  if (spec.biome !== undefined) out.biome = idStr(spec.biome);
  if (spec.dimension !== undefined) out.dimension = idStr(spec.dimension);
  if (spec.structure !== undefined) out.structure = idStr(spec.structure);
  if (spec.block !== undefined) {
    out.block =
      typeof spec.block === "string"
        ? { blocks: idStr(spec.block) }
        : { blocks: spec.block.render() };
  }
  if (spec.position) {
    const p: PredicateJson = {};
    if (spec.position.x !== undefined) p.x = bound(spec.position.x);
    if (spec.position.y !== undefined) p.y = bound(spec.position.y);
    if (spec.position.z !== undefined) p.z = bound(spec.position.z);
    out.position = p;
  }
  return out;
}

function renderEntitySpec(spec: EntityPredicateSpec, version: VersionProfile): PredicateJson {
  const out: PredicateJson = {};
  if (spec.type !== undefined) out.type = idStr(spec.type);
  if (spec.nbt !== undefined) out.nbt = spec.nbt.render(version);
  if (spec.team !== undefined) out.team = spec.team;
  if (spec.flags) {
    const flags: PredicateJson = {};
    for (const [k, val] of Object.entries(spec.flags)) {
      if (val !== undefined) flags[k] = val;
    }
    if (Object.keys(flags).length) out.flags = flags;
  }
  if (spec.equipment) {
    const eq: PredicateJson = {};
    for (const [slot, item] of Object.entries(spec.equipment)) {
      if (item) eq[slot] = item.toPredicate(version);
    }
    if (Object.keys(eq).length) out.equipment = eq;
  }
  if (spec.location) out.location = renderLocation(spec.location, version);
  if (spec.vehicle) out.vehicle = renderEntitySpec(spec.vehicle, version);
  if (spec.passenger) out.passenger = renderEntitySpec(spec.passenger, version);
  return out;
}

/**
 * A composable Minecraft predicate condition tree. Renders to the JSON written
 * into `data/<ns>/<predicate folder>/<name>.json` (via {@link Datapack.predicate})
 * and referenced by id from `@e[predicate=...]` (`Selector.predicate`) or
 * `execute if predicate ...` (`predicateCheck`).
 *
 * The point: express an entity-state check - *including NBT* - once, as a typed,
 * referenceable, engine-evaluated predicate, instead of inlining `nbt={...}` into
 * every selector. `Predicate.entity({ nbt })` is the "over NBT" path.
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

  // ---- leaf conditions -----------------------------------------------------

  /** `entity_properties` - match `who` (default the looked-at entity) against typed properties. */
  static entity(spec: EntityPredicateSpec, who: EntityTarget = "this"): Predicate {
    return new Predicate((v) => ({
      condition: "minecraft:entity_properties",
      entity: who,
      predicate: renderEntitySpec(spec, v),
    }));
  }

  /** `entity_scores` - objective bounds on `who`'s scores. */
  static scores(scores: Record<string, ScoreBound>, who: EntityTarget = "this"): Predicate {
    return new Predicate(() => {
      const out: PredicateJson = {};
      for (const [obj, b] of Object.entries(scores)) {
        out[obj] = typeof b === "number" ? b : { min: b.min, max: b.max };
      }
      return { condition: "minecraft:entity_scores", entity: who, scores: out };
    });
  }

  /** `block_state_property` - the block being checked plus optional blockstate values. */
  static blockState(block: string | BlockValue, properties?: Record<string, string>): Predicate {
    return new Predicate((_v) => {
      const out: PredicateJson = {
        condition: "minecraft:block_state_property",
        block: typeof block === "string" ? idStr(block) : block.render(),
      };
      if (properties && Object.keys(properties).length) out.properties = properties;
      return out;
    });
  }

  /** `location_check` - facts about the location being evaluated. */
  static location(spec: LocationSpec): Predicate {
    return new Predicate((v) => ({
      condition: "minecraft:location_check",
      predicate: renderLocation(spec, v),
    }));
  }

  /**
   * `match_tool` - passes when the item being used/checked matches `item`. Built
   * from the *same* {@link ItemValue} you'd `give`, via its `toPredicate(...)`, so
   * there is exactly one definition of the item. (Note: `match_tool` is evaluated
   * against the tool in loot/mining contexts; for held-item checks on an entity
   * use `Selector.holding(item)`.)
   */
  static matchTool(item: ItemValue): Predicate {
    return new Predicate((v) => ({
      condition: "minecraft:match_tool",
      predicate: item.toPredicate(v),
    }));
  }

  /**
   * `entity_properties` matching an entity carrying `item` in `slot` (default
   * `mainhand` - a player's selected hotbar item). The engine-evaluated,
   * referenceable replacement for an inline `nbt={SelectedItem:{id:...}}` scan;
   * built from the same {@link ItemValue} you'd `give`, via its `toPredicate(...)`.
   */
  static holding(
    item: ItemValue,
    slot: keyof EquipmentSpec = "mainhand",
    who: EntityTarget = "this",
  ): Predicate {
    return Predicate.entity({ equipment: { [slot]: item } }, who);
  }

  /** `weather_check`. */
  static weather(spec: { raining?: boolean; thundering?: boolean }): Predicate {
    return new Predicate(() => {
      const out: PredicateJson = { condition: "minecraft:weather_check" };
      if (spec.raining !== undefined) out.raining = spec.raining;
      if (spec.thundering !== undefined) out.thundering = spec.thundering;
      return out;
    });
  }

  /** `random_chance` - passes with probability `chance` (0..1). */
  static randomChance(chance: number): Predicate {
    return new Predicate(() => ({ condition: "minecraft:random_chance", chance }));
  }

  /** `reference` - defer to another predicate by id. */
  static reference(ref: PredicateRef | Id | string): Predicate {
    const name =
      ref instanceof PredicateRef ? ref.id : typeof ref === "string" ? Id(ref).render() : ref.render();
    return new Predicate(() => ({ condition: "minecraft:reference", name }));
  }

  // ---- combinators ---------------------------------------------------------

  /** `all_of` - passes only if every term passes (logical AND). */
  static all(...terms: Predicate[]): Predicate {
    return new Predicate((v) => ({
      condition: "minecraft:all_of",
      terms: terms.map((t) => t.toJson(v)),
    }));
  }

  /** `any_of` - passes if any term passes (logical OR). */
  static any(...terms: Predicate[]): Predicate {
    return new Predicate((v) => ({
      condition: "minecraft:any_of",
      terms: terms.map((t) => t.toJson(v)),
    }));
  }

  /** `inverted` - passes iff `term` fails (logical NOT). */
  static not(term: Predicate): Predicate {
    return new Predicate((v) => ({ condition: "minecraft:inverted", term: term.toJson(v) }));
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

/**
 * A handle to a registered predicate file: carries its resource id (`<ns>:name`)
 * and renders to that id as a {@link CommandValue}, so it can be passed straight
 * to `Selector.predicate(...)` / `predicateCheck(...)`. Created by
 * {@link Datapack.predicate}.
 */
export class PredicateRef implements CommandValue {
  constructor(readonly id: string) {}
  render(): string {
    return this.id;
  }
}
