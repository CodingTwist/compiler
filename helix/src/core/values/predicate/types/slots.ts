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
  | "armor.head"
  | "armor.chest"
  | "armor.legs"
  | "armor.feet"
  | "armor.body"
  | "horse.chest"
  | "horse.armor"
  | "horse.saddle"
  | "saddle"
  | "weapon"
  | "weapon.mainhand"
  | "weapon.offhand"
  | "contents"
  | "player.cursor"
  | "armor.*"
  | "container.*"
  | "enderchest.*"
  | "horse.*"
  | "hotbar.*"
  | "inventory.*"
  | "player.crafting.*"
  | "weapon.*"
  | "mob.inventory.*";

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
