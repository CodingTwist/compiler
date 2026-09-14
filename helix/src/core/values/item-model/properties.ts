// Id vocabularies for item models: property ids per arm, tint source and special model types.

/**
 * Property ids for `minecraft:condition` item models. Hand-listed (client-only registry);
 * use `.raw()` for new ones.
 */
export const CONDITION_PROPERTIES = {
  USING_ITEM: "minecraft:using_item",
  BROKEN: "minecraft:broken",
  DAMAGED: "minecraft:damaged",
  HAS_COMPONENT: "minecraft:has_component",
  FISHING_ROD_CAST: "minecraft:fishing_rod/cast",
  BUNDLE_HAS_SELECTED_ITEM: "minecraft:bundle/has_selected_item",
  SELECTED: "minecraft:selected",
  CARRIED: "minecraft:carried",
  EXTENDED_VIEW: "minecraft:extended_view",
  KEYBIND_DOWN: "minecraft:keybind_down",
  VIEW_ENTITY: "minecraft:view_entity",
  CUSTOM_MODEL_DATA: "minecraft:custom_model_data",
  COMPONENT: "minecraft:component",
} as const;

/** Property ids for the `minecraft:select` item-model arm (string/enum-valued). */
export const SELECT_PROPERTIES = {
  MAIN_HAND: "minecraft:main_hand",
  CHARGE_TYPE: "minecraft:charge_type",
  TRIM_MATERIAL: "minecraft:trim_material",
  BLOCK_STATE: "minecraft:block_state",
  DISPLAY_CONTEXT: "minecraft:display_context",
  LOCAL_TIME: "minecraft:local_time",
  CONTEXT_DIMENSION: "minecraft:context_dimension",
  CONTEXT_ENTITY_TYPE: "minecraft:context_entity_type",
  CUSTOM_MODEL_DATA: "minecraft:custom_model_data",
  COMPONENT: "minecraft:component",
} as const;

/** Property ids for the `minecraft:range_dispatch` item-model arm (number-valued). */
export const RANGE_DISPATCH_PROPERTIES = {
  BUNDLE_FULLNESS: "minecraft:bundle/fullness",
  DAMAGE: "minecraft:damage",
  COUNT: "minecraft:count",
  COOLDOWN: "minecraft:cooldown",
  CROSSBOW_PULL: "minecraft:crossbow/pull",
  TIME: "minecraft:time",
  COMPASS: "minecraft:compass",
  USE_CYCLE: "minecraft:use_cycle",
  USE_DURATION: "minecraft:use_duration",
  CUSTOM_MODEL_DATA: "minecraft:custom_model_data",
} as const;

/** Type ids for the `minecraft:tint_source` registry (see `TintSource`). */
export const TINT_SOURCES = {
  CONSTANT: "minecraft:constant",
  DYE: "minecraft:dye",
  GRASS: "minecraft:grass",
  FIREWORK: "minecraft:firework",
  POTION: "minecraft:potion",
  MAP_COLOR: "minecraft:map_color",
  TEAM: "minecraft:team",
  CUSTOM_MODEL_DATA: "minecraft:custom_model_data",
  COMPONENT: "minecraft:component",
} as const;

/** Type ids for the `minecraft:special_model_type` registry (see `SpecialModel`). */
export const SPECIAL_MODEL_TYPES = {
  BED: "minecraft:bed",
  BANNER: "minecraft:banner",
  CONDUIT: "minecraft:conduit",
  CHEST: "minecraft:chest",
  HEAD: "minecraft:head",
  SHULKER_BOX: "minecraft:shulker_box",
  SHIELD: "minecraft:shield",
  TRIDENT: "minecraft:trident",
  DECORATED_POT: "minecraft:decorated_pot",
  STANDING_SIGN: "minecraft:standing_sign",
  HANGING_SIGN: "minecraft:hanging_sign",
} as const;
