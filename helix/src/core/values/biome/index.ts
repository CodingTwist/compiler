// Biome definitions for `dp.biome(name, new BiomeDef()...)`.
//
// Settings are version-agnostic; `BiomeDef.toJson` shapes them for the target version (see
// `versions.ts` for where each format change landed).
export { BiomeDef } from "./def";
export { BiomeEffects } from "./effects";
export { CarveStep, DecorationStep, GrassColorModifier, SpawnCategory, TemperatureModifier } from "./enums";
export type { BiomeColor, MoodSoundOpts, MusicOpts, SpawnCostOpts, SpawnerOpts, WorldgenRef } from "./types";
