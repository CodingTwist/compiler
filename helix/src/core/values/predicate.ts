import { VersionProfile } from "../../versions/profile";
import { DV } from "./entity-versions.generated";
import { Nbt } from "./nbt";
import { Id } from "./id";
import { BlockValue } from "./block";
import { ItemValue } from "./item";
import { CommandValue } from "./value";

/** A score bound in `entity_scores`: an exact int or an inclusive `{min,max}`. */
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
  /** 1.21+. */
  is_on_ground?: boolean;
  /** 1.21+. */
  is_flying?: boolean;
  /** 1.21.11+. */
  is_in_water?: boolean;
  /** 1.21.11+. */
  is_fall_flying?: boolean;
}

/** The first version each newer flag exists in (vanilla-mcdoc `EntityFlagsPredicate`). */
const FLAG_SINCE: Partial<Record<keyof EntityFlags, keyof typeof DV>> = {
  is_on_ground: "1.21",
  is_flying: "1.21",
  is_in_water: "1.21.11",
  is_fall_flying: "1.21.11",
};

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

/** The body of an `entity_properties` check. Fields are only emitted when set. */
export interface EntityPredicateSpec {
  /** Entity type id or tag, e.g. `"minecraft:zombie"` / `"#minecraft:skeletons"`. */
  type?: string | Id;
  /** NBT match. Use {@link Nbt} so embedded values render for the version. */
  nbt?: Nbt;
  /** Team name. */
  team?: string;
  /** Boolean state flags. */
  flags?: EntityFlags;
  /** Item match per equipment slot - each built from the same {@link ItemValue} you'd `give`. */
  equipment?: EquipmentSpec;
  /**
   * Item match per slot range, replacing `nbt={Inventory:[...]}` scans (which broke with
   * components).
   *
   * Passes if any slot in the range matches. Use {@link SLOTS}: an unknown slot name makes
   * the
   * engine reject the whole file.
   */
  slots?: Partial<Record<SlotRange, ItemValue>>;
  /** Where the entity is. */
  location?: LocationSpec;
  /** What the entity is riding (a nested entity predicate). */
  vehicle?: EntityPredicateSpec;
  /** What is riding the entity (a nested entity predicate). */
  passenger?: EntityPredicateSpec;
}

/**
 * Every slot name accepted in {@link EntityPredicateSpec.slots}.
 *
 * A closed union because an unknown name makes Minecraft reject the whole predicate file,
 * silently in game. Includes names from every version.
 */
export type SlotRange =
  | `container.${number}`
  | `enderchest.${number}`
  | `horse.${number}`
  | `hotbar.${number}`
  | `inventory.${number}`
  | `villager.${number}`
  | `mob.inventory.${number}`
  | `player.crafting.${number}`
  | "armor.head" | "armor.chest" | "armor.legs" | "armor.feet" | "armor.body"
  | "horse.chest" | "horse.armor" | "horse.saddle" | "saddle"
  | "weapon" | "weapon.mainhand" | "weapon.offhand"
  | "contents" | "player.cursor"
  | "armor.*" | "container.*" | "enderchest.*" | "horse.*" | "hotbar.*"
  | "inventory.*" | "player.crafting.*" | "weapon.*" | "mob.inventory.*";

/** Common slot ranges by name. Any other {@link SlotRange} also works. */
export const SLOTS = {
  /** Every slot of a player's inventory, hotbar included. */
  INVENTORY: "container.*",
  /** The nine hotbar slots. */
  HOTBAR: "hotbar.*",
  /** The 27 slots of the main inventory grid. */
  MAIN: "inventory.*",
  /** The offhand. */
  OFFHAND: "weapon.offhand",
  /** The helmet slot - what a worn player head occupies. */
  HEAD: "armor.head",
} as const;

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
      if (val === undefined) continue;
      const since = FLAG_SINCE[k as keyof EntityFlags];
      if (since && version.dataVersion < DV[since]) {
        throw new Error(`Predicate flag ${k} needs ${since}+, but the pack targets ${version.id}`);
      }
      flags[k] = val;
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
  if (spec.slots) {
    const slots: PredicateJson = {};
    for (const [range, item] of Object.entries(spec.slots)) {
      if (item) slots[range] = item.toPredicate(version);
    }
    if (Object.keys(slots).length) out.slots = slots;
  }
  if (spec.location) out.location = renderLocation(spec.location, version);
  if (spec.vehicle) out.vehicle = renderEntitySpec(spec.vehicle, version);
  if (spec.passenger) out.passenger = renderEntitySpec(spec.passenger, version);
  return out;
}

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
   * `match_tool`: passes when the tool matches `item`. For loot and mining; use
   * `Selector.holding(item)` for held items.
   */
  static matchTool(item: ItemValue): Predicate {
    return new Predicate((v) => ({
      condition: "minecraft:match_tool",
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
 * A handle to a registered predicate that renders as its id. Created by {@link
 * Datapack.predicate}.
 */
export class PredicateRef implements CommandValue {
  constructor(readonly id: string) {}
  render(): string {
    return this.id;
  }
}
