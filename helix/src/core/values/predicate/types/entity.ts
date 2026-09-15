import type { Nbt } from "../../nbt";
import type { Id } from "../../id";
import type { ItemValue } from "../../item";
import type { Bound, IdList } from "./common";
import type { LocationSpec } from "./location";
import type { SlotRange } from "./slots";
import type { TypeSpecificSpec } from "./type-specific";

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

/** The entity's movement last tick, and how far it has fallen. */
export interface MovementSpec {
  x?: Bound;
  y?: Bound;
  z?: Bound;
  speed?: Bound;
  horizontalSpeed?: Bound;
  verticalSpeed?: Bound;
  fallDistance?: Bound;
}

/** Distance from the check's origin to the entity. */
export interface DistanceSpec {
  x?: Bound;
  y?: Bound;
  z?: Bound;
  absolute?: Bound;
  horizontal?: Bound;
}

/** One active effect, e.g. `{ effect: MobEffect.SPEED, amplifier: { min: 1 } }`. */
export interface EffectSpec {
  effect: string | Id;
  amplifier?: Bound;
  duration?: Bound;
  ambient?: boolean;
  visible?: boolean;
}

/** The body of an `entity_properties` check. Fields are only emitted when set. */
export interface EntityPredicateSpec {
  /** Entity type id, tag, or a list (1.20.5+), e.g. `EntityType.ZOMBIE`. */
  type?: IdList;
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
   * the engine reject the whole file.
   */
  slots?: Partial<Record<SlotRange, ItemValue>>;
  /** Where the entity is. */
  location?: LocationSpec;
  /** The block the entity stands on. 1.17+. */
  steppingOn?: LocationSpec;
  /** The block up to 0.5 below the entity that affects its movement. 1.21+. */
  movementAffectedBy?: LocationSpec;
  /** Distance from the origin of the check. */
  distance?: DistanceSpec;
  /** Active effects; all must match. */
  effects?: EffectSpec[];
  /** Movement last tick. Speeds are in blocks per second. 1.21+. */
  movement?: MovementSpec;
  /** True every `n` ticks of the entity's life. 1.21+. */
  periodicTick?: number;
  /** Scoreboard tags. 26.2+; before that use `Selector.tag`. */
  entityTags?: { anyOf?: string[]; allOf?: string[]; noneOf?: string[] };
  /**
   * Exact data component values, keyed by component id. 1.21.5+.
   *
   * Raw JSON: helix has no typed entity components yet.
   */
  components?: Record<string, unknown>;
  /** Data component sub-predicates, keyed by type. 1.21.5+. Raw JSON, as {@link components}. */
  predicates?: Record<string, unknown>;
  /** A check for one kind of entity (player, raider, slime, ...). 1.19+. */
  typeSpecific?: TypeSpecificSpec;
  /** What the entity is riding (a nested entity predicate). */
  vehicle?: EntityPredicateSpec;
  /** What is riding the entity (a nested entity predicate). */
  passenger?: EntityPredicateSpec;
  /** What the mob is targeting. */
  targetedEntity?: EntityPredicateSpec;
}
