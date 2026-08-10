import type { VersionProfile } from "../../versions/profile";
import type { BlockValue } from "./block";
import type { ItemValue } from "./item";
import type { Vec3 } from "./transform-math";
import { Byte, Double, Float, Long, Short } from "./nbt";
import type { NbtInput } from "./nbt";
import {
  asByte,
  asDoubles,
  asFloats,
  asList,
  asText,
  atLeast,
  defineEntityNbt,
  field,
} from "./entity-nbt";
import type { EntityNbtSchema } from "./entity-nbt";

/**
 * The curated entity schemas - the *data* half of `entity-nbt.ts`, which holds the
 * mechanism. Everything here is transcribed from **vanilla-mcdoc**
 * (`java/world/entity/*.mcdoc`), which carries every field with exact `since`/`until`
 * gates; each block cites the file it came from. Hand-transcribed rather than generated -
 * resolving mcdoc's dispatches, `%parent` references and union types is far more
 * machinery than copying a dozen lines when a field is wanted.
 *
 * An entity that isn't here needs no compiler change: `defineEntityNbt` and `field` are
 * public, so a plugin curates its own.
 */

// --- shared bases ------------------------------------------------------------------

/** Fields every entity has (`java/world/entity/mod.mcdoc`, `EntityBase`). */
export interface EntityFields {
  pos?: Vec3;
  motion?: Vec3;
  /** `[yaw, pitch]`, in degrees. */
  rotation?: [number, number];
  fallDistance?: number;
  /** Ticks of fire left; negative is ticks until it starts burning. */
  fire?: number;
  air?: number;
  onGround?: boolean;
  noGravity?: boolean;
  invulnerable?: boolean;
  portalCooldown?: number;
  /** A plain-text name; style it with `raw` if you need a full component. */
  customName?: string;
  customNameVisible?: boolean;
  silent?: boolean;
  glowing?: boolean;
  tags?: readonly string[];
  hasVisualFire?: boolean;
  ticksFrozen?: number;
}

export const ENTITY: EntityNbtSchema<EntityFields> = {
  pos: field({ key: "Pos", encode: asDoubles }),
  motion: field({ key: "Motion", encode: asDoubles }),
  rotation: field({ key: "Rotation", encode: asFloats }),
  // 1.21.5 both renamed this and widened it from a float to a double.
  fallDistance: (v, version): Record<string, NbtInput> =>
    atLeast(version, "1.21.5")
      ? { fall_distance: Double(v) }
      : { FallDistance: Float(v) },
  fire: field({ key: "Fire", encode: Short }),
  air: field({ key: "Air", encode: Short }),
  onGround: field({ key: "OnGround", encode: asByte }),
  noGravity: field({ key: "NoGravity", encode: asByte }),
  invulnerable: field({ key: "Invulnerable", encode: asByte }),
  portalCooldown: field({ key: "PortalCooldown" }),
  customName: field({ key: "CustomName", encode: asText }),
  customNameVisible: field({ key: "CustomNameVisible", encode: asByte }),
  silent: field({ key: "Silent", encode: asByte }),
  glowing: field({ key: "Glowing", encode: asByte }),
  tags: field({ key: "Tags", encode: asList }),
  hasVisualFire: field({ key: "HasVisualFire", encode: asByte, since: "1.17" }),
  ticksFrozen: field({ key: "TicksFrozen", since: "1.17" }),
};

/** Fields every living entity adds (`java/world/entity/mob/mod.mcdoc`, `LivingEntity`). */
export interface LivingFields extends EntityFields {
  health?: number;
  absorptionAmount?: number;
  hurtTime?: number;
  deathTime?: number;
  fallFlying?: boolean;
  /** Attribute modifier entries, as raw compounds. */
  attributes?: readonly NbtInput[];
  /** Potion effect entries, as raw compounds. */
  activeEffects?: readonly NbtInput[];
}

export const LIVING: EntityNbtSchema<LivingFields> = {
  ...ENTITY,
  health: field({ key: "Health", encode: Float }),
  absorptionAmount: field({ key: "AbsorptionAmount", encode: Float }),
  hurtTime: field({ key: "HurtTime", encode: Short }),
  deathTime: field({ key: "DeathTime", encode: Short }),
  fallFlying: field({ key: "FallFlying", encode: asByte }),
  attributes: field({
    key: "attributes",
    encode: asList,
    was: { key: "Attributes", until: "1.21" },
  }),
  activeEffects: field({
    key: "active_effects",
    encode: asList,
    was: { key: "ActiveEffects", until: "1.20.2" },
  }),
};

/** Fields every mob adds (`java/world/entity/mob/mod.mcdoc`, `MobBase`). */
export interface MobFields extends LivingFields {
  noAI?: boolean;
  persistenceRequired?: boolean;
  canPickUpLoot?: boolean;
  leftHanded?: boolean;
  deathLootTable?: string;
  deathLootTableSeed?: number;
}

export const MOB: EntityNbtSchema<MobFields> = {
  ...LIVING,
  noAI: field({ key: "NoAI", encode: asByte }),
  persistenceRequired: field({ key: "PersistenceRequired", encode: asByte }),
  canPickUpLoot: field({ key: "CanPickUpLoot", encode: asByte }),
  leftHanded: field({ key: "LeftHanded", encode: asByte }),
  deathLootTable: field({ key: "DeathLootTable" }),
  deathLootTableSeed: field({ key: "DeathLootTableSeed", encode: Long }),
};

// --- entities ----------------------------------------------------------------------

/** `minecraft:tnt` (`java/world/entity/tnt.mcdoc`). */
export interface TntFields extends EntityFields {
  /** Ticks until it explodes; vanilla defaults to 80. */
  fuse?: number;
  /** The block it renders and places as. Defaults to tnt. */
  blockState?: BlockValue;
  explosionPower?: number;
}

export const Tnt = defineEntityNbt<TntFields>({
  ...ENTITY,
  // 1.20.3 snake_cased the fuse and added the block override at the same time.
  fuse: field({ key: "fuse", encode: Short, was: { key: "Fuse", until: "1.20.3" } }),
  blockState: field({
    key: "block_state",
    encode: (b) => b.toBlockState(),
    since: "1.20.3",
  }),
  explosionPower: field({ key: "explosion_power", encode: Float, since: "1.21.2" }),
});

/** `minecraft:falling_block` (`java/world/entity/falling_block.mcdoc`). */
export interface FallingBlockFields extends EntityFields {
  /** The block it places on landing. Defaults to sand. */
  blockState?: BlockValue;
  /** Ticks it has existed; it despawns past 600 unless `noGravity`. */
  time?: number;
  dropItem?: boolean;
  hurtEntities?: boolean;
  fallHurtMax?: number;
  fallHurtAmount?: number;
  /** Destroy the block instead of placing it on landing. */
  cancelDrop?: boolean;
}

export const FallingBlock = defineEntityNbt<FallingBlockFields>({
  ...ENTITY,
  blockState: field({ key: "BlockState", encode: (b) => b.toBlockState() }),
  time: field({ key: "Time" }),
  dropItem: field({ key: "DropItem", encode: asByte }),
  hurtEntities: field({ key: "HurtEntities", encode: asByte }),
  fallHurtMax: field({ key: "FallHurtMax" }),
  fallHurtAmount: field({ key: "FallHurtAmount", encode: Float }),
  cancelDrop: field({ key: "CancelDrop", encode: asByte, since: "1.20" }),
});

/**
 * `minecraft:item` - a dropped item stack (`java/world/entity/item.mcdoc`). Named
 * `ItemEntity` because {@link Item} is the stack itself.
 */
export interface ItemEntityFields extends EntityFields {
  item?: ItemValue;
  /** Ticks it has existed; it despawns at 6000. */
  age?: number;
  health?: number;
  /** Ticks before anyone can pick it up. */
  pickupDelay?: number;
}

export const ItemEntity = defineEntityNbt<ItemEntityFields>({
  ...ENTITY,
  item: field({ key: "Item", encode: (i) => i.stackNbt() }),
  age: field({ key: "Age", encode: Short }),
  health: field({ key: "Health", encode: Short }),
  pickupDelay: field({ key: "PickupDelay", encode: Short }),
});

/** `minecraft:armor_stand` (`java/world/entity/mob/armor_stand.mcdoc`). */
export interface ArmorStandFields extends LivingFields {
  invisible?: boolean;
  /** No hitbox - the usual marker-stand trick. */
  marker?: boolean;
  noBasePlate?: boolean;
  showArms?: boolean;
  small?: boolean;
  /** Body-part rotations in degrees, e.g. `{ Head: [30, 0, 0] }`. */
  pose?: Record<string, Vec3>;
}

export const ArmorStand = defineEntityNbt<ArmorStandFields>({
  ...LIVING,
  invisible: field({ key: "Invisible", encode: asByte }),
  marker: field({ key: "Marker", encode: asByte }),
  noBasePlate: field({ key: "NoBasePlate", encode: asByte }),
  showArms: field({ key: "ShowArms", encode: asByte }),
  small: field({ key: "Small", encode: asByte }),
  pose: field({
    key: "Pose",
    encode: (p) =>
      Object.fromEntries(Object.entries(p).map(([part, r]) => [part, asFloats(r)])),
  }),
});

/** `minecraft:area_effect_cloud` (`java/world/entity/area_effect_cloud.mcdoc`). */
export interface AreaEffectCloudFields extends EntityFields {
  /** Ticks it has existed; it despawns past `duration + waitTime`. */
  age?: number;
  /** Particle colour, `red << 16 | green << 8 | blue`. */
  color?: number;
  duration?: number;
  /** Ticks before it appears. */
  waitTime?: number;
  reapplicationDelay?: number;
  durationOnUse?: number;
  radius?: number;
  radiusOnUse?: number;
  radiusPerTick?: number;
  /** The `potion_contents` component compound (1.20.5+). */
  potionContents?: NbtInput;
}

export const AreaEffectCloud = defineEntityNbt<AreaEffectCloudFields>({
  ...ENTITY,
  age: field({ key: "Age" }),
  color: field({ key: "Color" }),
  duration: field({ key: "Duration" }),
  waitTime: field({ key: "WaitTime" }),
  reapplicationDelay: field({ key: "ReapplicationDelay" }),
  durationOnUse: field({ key: "DurationOnUse" }),
  radius: field({ key: "Radius", encode: Float }),
  radiusOnUse: field({ key: "RadiusOnUse", encode: Float }),
  radiusPerTick: field({ key: "RadiusPerTick", encode: Float }),
  potionContents: field({ key: "potion_contents", since: "1.20.5" }),
});

/** `minecraft:villager` (`java/world/entity/mob/breedable/villager.mcdoc`). */
export interface VillagerFields extends MobFields {
  /** Trade tier, 1-5. */
  level?: number;
  /** e.g. `"farmer"`, `"librarian"`, `"none"`. */
  profession?: string;
  /** The biome variant, e.g. `"plains"`, `"snow"`. */
  villagerType?: string;
  xp?: number;
  /** 0-12; it can breed at 12. */
  foodLevel?: number;
}

export const Villager = defineEntityNbt<VillagerFields>({
  ...MOB,
  // All three live inside one `VillagerData` compound - the schema's records are
  // deep-merged, so each states only its own leaf.
  level: field({ key: "VillagerData", encode: (v) => ({ level: v }) }),
  profession: field({ key: "VillagerData", encode: (v) => ({ profession: v }) }),
  villagerType: field({ key: "VillagerData", encode: (v) => ({ type: v }) }),
  xp: field({ key: "Xp" }),
  foodLevel: field({ key: "FoodLevel", encode: Byte }),
});
