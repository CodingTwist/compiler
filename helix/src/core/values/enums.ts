// Small fixed-vocabulary parsers. These are plain string-literal unions: the
// builder still passes the string through `argPart`, but the author gets
// autocomplete and a compile error on a typo.

/**
 * `gamemode` - the four vanilla game modes. A named-constant namespace *and* the
 * string-union type of the same name (TS declaration merging): author
 * `Gamemode.SURVIVAL` instead of the bare, typo-prone `"survival"`, while
 * `Gamemode` still types every `gamemode: Gamemode` parameter (commands and
 * `Selector.gamemode`) as the union of the four ids. Each member is the vanilla id
 * the command/selector renders - same "typed concepts, not strings" stance as
 * {@link Slot}, `Item.DIAMOND`, `Block.STONE`.
 */
export const Gamemode = {
  SURVIVAL: "survival",
  CREATIVE: "creative",
  ADVENTURE: "adventure",
  SPECTATOR: "spectator",
} as const;
export type Gamemode = (typeof Gamemode)[keyof typeof Gamemode];

/**
 * Selector `sort=` - the order a multi-match selector returns entities in. A
 * named-constant namespace + union type (declaration merging), same stance as
 * {@link Gamemode}: author `Sort.NEAREST` over the bare, typo-prone `"nearest"`.
 */
export const Sort = {
  NEAREST: "nearest",
  FURTHEST: "furthest",
  RANDOM: "random",
  ARBITRARY: "arbitrary",
} as const;
export type Sort = (typeof Sort)[keyof typeof Sort];

/**
 * `entity_anchor` - the point on an entity a `facing`/`anchored` clause aims from.
 * Named-constant namespace + union type (declaration merging), same stance as
 * {@link Gamemode}: author `EntityAnchor.EYES` over the bare `"eyes"`.
 */
export const EntityAnchor = {
  EYES: "eyes",
  FEET: "feet",
} as const;
export type EntityAnchor = (typeof EntityAnchor)[keyof typeof EntityAnchor];

/**
 * The vanilla **named text colours** - the fixed palette a text component's
 * `color` field accepts by name. Named-constant namespace + union type
 * (declaration merging), same stance as {@link Gamemode}: author
 * `Color.GOLD` over the bare, typo-prone `"gold"`. Arbitrary `#RRGGBB` hex is
 * still allowed at the call site (see `TellrawPart.color`) - this covers just
 * the 16 vanilla names plus `reset`.
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

/**
 * `swizzle` - an axis combo for `align`/`positioned`. The canonical-order subsets
 * of {x, y, z}; the union gives autocomplete and rejects typos (`"xzy"`, `"abc"`)
 * at compile time. Reorderings (`"yx"`) are intentionally excluded - write the
 * axes low-to-high.
 */
export type Swizzle = "x" | "y" | "z" | "xy" | "xz" | "yz" | "xyz";

// Free-text / open-vocabulary parsers kept as `string` (with a meaningful name).
export type Message = string; // `message`
export type ItemSlot = string; // `item_slot` / `item_slots`

/**
 * Typed slot references for `item replace`/`item modify` and friends. The single
 * equipment slots are named members so authors write `Slot.MAINHAND` instead of
 * the bare, typo-prone string `"weapon.mainhand"`; the indexed containers stay
 * open via the `container(n)`/`hotbar(n)` helpers. Each renders to the vanilla
 * slot string an {@link ItemSlot} expects.
 */
export const Slot = {
  MAINHAND: "weapon.mainhand",
  OFFHAND: "weapon.offhand",
  HEAD: "armor.head",
  CHEST: "armor.chest",
  LEGS: "armor.legs",
  FEET: "armor.feet",
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
