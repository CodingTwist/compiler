// dataVersion of the snapshot each biome format change landed in.

/** 24w33a (1.21.2): `carvers` became a flat list. */
export const CARVER_LIST_DATA_VERSION = 4058;

/**
 * 24w44a (1.21.4): `effects.music` became a weighted list, and `effects.music_volume` was
 * added.
 */
export const MUSIC_LIST_DATA_VERSION = 4174;

/** 25w08a (1.21.5): `effects.dry_foliage_color`. */
export const DRY_FOLIAGE_DATA_VERSION = 4316;

/**
 * 25w42a (1.21.11): ambience moved from `effects` to the `attributes` map.
 *
 * Fog, sky and water fog colours go to `minecraft:visual/*`, particles to
 * `visual/ambient_particles`,
 * sounds to `audio/ambient_sounds`, music to `audio/background_music`. Only block tints
 * stay in `effects`.
 * Authors call `.fogColor(...)` and `BiomeEffects` places it for the target version.
 */
export const ATTRIBUTES_DATA_VERSION = 4654;
