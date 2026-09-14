import type { Nbt } from "../nbt";
import type { Id } from "../id";
import type { BlockValue } from "../block";
import type { ItemValue } from "../item";

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
