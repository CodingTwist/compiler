// Curated, common NBT paths as const namespaces for autocomplete - there is no
// machine-readable NBT schema to generate from, so this is a hand-picked subset
// covering the common cases. Each constant is a real `NbtPath` concept (not a
// bare string), so it drops straight into the typed `data` API; any path not
// curated here is still reachable via `NbtPath("...")`:
//
//   ctx.entity(self).at(Path.Entity.Health)      // autocompletes, is an NbtPath
//   ctx.block(here).remove(NbtPath("Items[0]"))  // free path, wrapped explicitly
//
// Names follow the SNBT keys the game uses. Note a few were renamed across
// versions (e.g. ActiveEffects -> active_effects in 1.20.5+); prefer an explicit
// `NbtPath("...")` when targeting a version where the curated name doesn't apply.
import { NbtPath } from "./nbt";

/** Wrap a `{ key: "snbtPath" }` map into one of typed {@link NbtPath} concepts. */
const paths = <T extends Record<string, string>>(
  m: T,
): { readonly [K in keyof T]: NbtPath } => {
  const out = {} as { [K in keyof T]: NbtPath };
  for (const k in m) out[k] = NbtPath(m[k]);
  return out;
};

/** NBT paths on any entity. */
const Entity = {
  Health: "Health",
  Pos: "Pos",
  Motion: "Motion",
  Rotation: "Rotation",
  Air: "Air",
  Fire: "Fire",
  OnGround: "OnGround",
  NoGravity: "NoGravity",
  Invulnerable: "Invulnerable",
  Silent: "Silent",
  Glowing: "Glowing",
  CustomName: "CustomName",
  CustomNameVisible: "CustomNameVisible",
  Tags: "Tags",
  UUID: "UUID",
  FallDistance: "FallDistance",
  HurtTime: "HurtTime",
  DeathTime: "DeathTime",
  PortalCooldown: "PortalCooldown",
  Attributes: "Attributes",
  HandItems: "HandItems",
  ArmorItems: "ArmorItems",
} as const;

/** NBT paths specific to players. */
const Player = {
  SelectedItem: "SelectedItem",
  SelectedItemSlot: "SelectedItemSlot",
  Inventory: "Inventory",
  EnderItems: "EnderItems",
  XpLevel: "XpLevel",
  XpTotal: "XpTotal",
  XpP: "XpP",
  Score: "Score",
  foodLevel: "foodLevel",
  foodSaturationLevel: "foodSaturationLevel",
  playerGameType: "playerGameType",
  abilities: "abilities",
  SpawnX: "SpawnX",
  SpawnY: "SpawnY",
  SpawnZ: "SpawnZ",
} as const;

/** NBT paths on block entities (containers, signs, spawners, ...). */
const Block = {
  Items: "Items",
  Lock: "Lock",
  LootTable: "LootTable",
  LootTableSeed: "LootTableSeed",
  CustomName: "CustomName",
  id: "id",
} as const;

/**
 * Common NBT paths, grouped by holder kind:
 * `Path.Entity.Health`, `Path.Player.SelectedItem`, `Path.Block.Items`.
 */
export const Path = {
  Entity: paths(Entity),
  Player: paths(Player),
  Block: paths(Block),
} as const;
