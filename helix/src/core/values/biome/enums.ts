// The fixed vocabularies a biome is keyed by: spawn categories, generation steps, modifiers.

/**
 * `temperature_modifier`: how the biome's temperature is adjusted. Use
 * `TemperatureModifier.FROZEN`.
 */
export const TemperatureModifier = {
  NONE: "none",
  FROZEN: "frozen",
} as const;
export type TemperatureModifier =
  (typeof TemperatureModifier)[keyof typeof TemperatureModifier];

/** `effects.grass_color_modifier` - the built-in grass recolour hacks. */
export const GrassColorModifier = {
  NONE: "none",
  /** Averaged with `#28340a`. */
  DARK_FOREST: "dark_forest",
  /** Position-dependent `#4c763c` / `#6a7039`; the base colour is ignored. */
  SWAMP: "swamp",
} as const;
export type GrassColorModifier =
  (typeof GrassColorModifier)[keyof typeof GrassColorModifier];

/** The mob categories a biome's `spawners` map is keyed by. */
export const SpawnCategory = {
  MONSTER: "monster",
  CREATURE: "creature",
  AMBIENT: "ambient",
  AXOLOTLS: "axolotls",
  UNDERGROUND_WATER_CREATURE: "underground_water_creature",
  WATER_CREATURE: "water_creature",
  WATER_AMBIENT: "water_ambient",
  MISC: "misc",
} as const;
export type SpawnCategory = (typeof SpawnCategory)[keyof typeof SpawnCategory];

/**
 * The 11 world-generation steps, in order. `features` is indexed by step, so name the step
 * instead.
 */
export const DecorationStep = {
  RAW_GENERATION: 0,
  LAKES: 1,
  LOCAL_MODIFICATIONS: 2,
  UNDERGROUND_STRUCTURES: 3,
  SURFACE_STRUCTURES: 4,
  STRONGHOLDS: 5,
  UNDERGROUND_ORES: 6,
  UNDERGROUND_DECORATION: 7,
  FLUID_SPRINGS: 8,
  VEGETAL_DECORATION: 9,
  TOP_LAYER_MODIFICATION: 10,
} as const;
export type DecorationStep =
  (typeof DecorationStep)[keyof typeof DecorationStep];

export const DECORATION_STEP_COUNT = 11;

/** The two carve steps of the pre-1.21.2 `carvers` object form. */
export const CarveStep = {
  AIR: "air",
  LIQUID: "liquid",
} as const;
export type CarveStep = (typeof CarveStep)[keyof typeof CarveStep];
