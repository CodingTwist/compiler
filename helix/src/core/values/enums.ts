// Small fixed vocabularies, typed for autocomplete and typo checks.

/** The four game modes. Use `Gamemode.SURVIVAL`; the type is the union of their ids. */
export const Gamemode = {
  SURVIVAL: "survival",
  CREATIVE: "creative",
  ADVENTURE: "adventure",
  SPECTATOR: "spectator",
} as const;
export type Gamemode = (typeof Gamemode)[keyof typeof Gamemode];

/** Selector `sort=` order. Use `Sort.NEAREST`. */
export const Sort = {
  NEAREST: "nearest",
  FURTHEST: "furthest",
  RANDOM: "random",
  ARBITRARY: "arbitrary",
} as const;
export type Sort = (typeof Sort)[keyof typeof Sort];

/** `entity_anchor`: the point `facing`/`anchored` aims from. Use `EntityAnchor.EYES`. */
export const EntityAnchor = {
  EYES: "eyes",
  FEET: "feet",
} as const;
export type EntityAnchor = (typeof EntityAnchor)[keyof typeof EntityAnchor];

/** `swing_animation` (26.3+): which arm `/swing` animates. */
export const SwingAnimation = {
  NONE: "none",
  WHACK: "whack",
  STAB: "stab",
} as const;
export type SwingAnimation = (typeof SwingAnimation)[keyof typeof SwingAnimation];

/**
 * `execute on <relation>`: switch the executor to a related entity.
 *
 * The only way to reach state NBT doesn't expose, like a mob's current attack `TARGET`.
 * No match means no executor, so the chain does nothing.
 */
export const Relation = {
  ATTACKER: "attacker",
  CONTROLLER: "controller",
  LEASHER: "leasher",
  ORIGIN: "origin",
  OWNER: "owner",
  PASSENGERS: "passengers",
  TARGET: "target",
  VEHICLE: "vehicle",
} as const;
export type Relation = (typeof Relation)[keyof typeof Relation];

/**
 * The named text colours: 16 vanilla colours plus `reset`. Use `Color.GOLD`; hex is also
 * allowed.
 */
export const Color = {
  BLACK: "black",
  DARK_BLUE: "dark_blue",
  DARK_GREEN: "dark_green",
  DARK_AQUA: "dark_aqua",
  DARK_RED: "dark_red",
  DARK_PURPLE: "dark_purple",
  GOLD: "gold",
  GRAY: "gray",
  DARK_GRAY: "dark_gray",
  BLUE: "blue",
  GREEN: "green",
  AQUA: "aqua",
  RED: "red",
  LIGHT_PURPLE: "light_purple",
  YELLOW: "yellow",
  WHITE: "white",
  RESET: "reset",
} as const;
export type Color = (typeof Color)[keyof typeof Color];

/** `operation` (scoreboard players operation) */
export type ScoreboardOperation =
  | "="
  | "+="
  | "-="
  | "*="
  | "/="
  | "%="
  | "<"
  | ">"
  | "><";

/** `template_rotation` */
export type TemplateRotation =
  | "none"
  | "clockwise_90"
  | "counterclockwise_90"
  | "180";

/** `template_mirror` */
export type TemplateMirror = "none" | "front_back" | "left_right";

/** An axis combination for `align`/`positioned`, in x-y-z order. */
export type Swizzle = "x" | "y" | "z" | "xy" | "xz" | "yz" | "xyz";

// Free-text / open-vocabulary parsers kept as `string` (with a meaningful name).
export type Message = string; // `message`
export type ItemSlot = string; // `item_slot` / `item_slots`

/**
 * Typed slot names for `item replace`/`item modify`, e.g. `Slot.MAINHAND`. Use
 * `container(n)`/`hotbar(n)` for indexed slots.
 */
export const Slot = {
  MAINHAND: "weapon.mainhand",
  OFFHAND: "weapon.offhand",
  HEAD: "armor.head",
  CHEST: "armor.chest",
  LEGS: "armor.legs",
  FEET: "armor.feet",
  /** `contents` - the one item an item display, item frame or dropped item holds. */
  CONTENTS: "contents",
  /** `container.<n>` - a slot in the target's container (chest, player inventory). */
  container: (n: number): ItemSlot => `container.${n}`,
  /** `hotbar.<n>` - a player's hotbar slot 0-8. */
  hotbar: (n: number): ItemSlot => `hotbar.${n}`,
  /** `inventory.<n>` - a player's main inventory (the 27 slots above the hotbar), 0-26. */
  inventory: (n: number): ItemSlot => `inventory.${n}`,
} as const;

export type ScoreboardSlot = string; // `scoreboard_slot`
export type Objective = string; // `objective` (objective name)
export type Team = string; // `team`
export type TeamColor = string; // `team_color`
export type HexColor = string; // `hex_color`
export type Uuid = string; // `uuid`
export type ObjectiveCriteria = string; // `objective_criteria`
