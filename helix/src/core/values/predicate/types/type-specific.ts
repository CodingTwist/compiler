import type { Id } from "../../id";
import type { Gamemode } from "../../enums";
import type { Bound, IdList } from "./common";
import type { EntityPredicateSpec } from "./entity";

/** Player-only facts. */
export interface PlayerSpec {
  /** One mode, or a list since 1.21. */
  gamemode?: Gamemode | Gamemode[];
  /** Experience level. */
  level?: Bound;
  /** Advancement id to done, or to a map of criterion to done. */
  advancements?: Record<string, boolean | Record<string, boolean>>;
  /** Recipe id to unlocked. */
  recipes?: Record<string, boolean>;
  /** Statistic checks, e.g. `{ type: "minecraft:custom", stat: "minecraft:jump", value: { min: 1 } }`. */
  stats?: { type: string | Id; stat: string | Id; value: Bound }[];
  /** The entity the player looks at. */
  lookingAt?: EntityPredicateSpec;
  /** Movement keys held. 1.21.2+. */
  input?: {
    forward?: boolean;
    backward?: boolean;
    left?: boolean;
    right?: boolean;
    jump?: boolean;
    sneak?: boolean;
    sprint?: boolean;
  };
  /** Hunger. 26.1+. */
  food?: { level?: Bound; saturation?: Bound };
}

/** Mobs whose variant check vanilla removed in 1.21.5 (use `components` there). */
export type VariantMob =
  | "axolotl"
  | "boat"
  | "cat"
  | "fox"
  | "frog"
  | "horse"
  | "llama"
  | "mooshroom"
  | "painting"
  | "parrot"
  | "rabbit"
  | "salmon"
  | "tropical_fish"
  | "villager"
  | "wolf";

/** A check that only applies to one kind of entity, chosen by `type`. */
export type TypeSpecificSpec =
  | ({ type: "player" } & PlayerSpec)
  | { type: "fishing_hook"; inOpenWater?: boolean }
  | {
      type: "lightning";
      blocksSetOnFire?: Bound;
      entityStruck?: EntityPredicateSpec;
    }
  | { type: "raider"; hasRaid?: boolean; isCaptain?: boolean }
  /** `color` was removed in 1.21.5. */
  | { type: "sheep"; sheared?: boolean; color?: string }
  /** Slimes and magma cubes. */
  | { type: "slime"; size?: Bound }
  | { type: VariantMob; variant: IdList };
