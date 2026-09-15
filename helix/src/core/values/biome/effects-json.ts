// Shapes a biome's effects for a version: the old `effects` object, or 1.21.11+ `attributes`.
import { VersionProfile } from "../../../versions/profile";
import type { EffectsState, MusicEntry } from "./types";
import {
  ATTRIBUTES_DATA_VERSION,
  DRY_FOLIAGE_DATA_VERSION,
  MUSIC_LIST_DATA_VERSION,
} from "./versions";

/** The colours that stay in `effects` on every version. */
function tintJson(
  s: EffectsState,
  version: VersionProfile,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (s.colors.water_color !== undefined)
    out.water_color = s.colors.water_color;
  if (s.colors.foliage_color !== undefined)
    out.foliage_color = s.colors.foliage_color;
  if (s.colors.grass_color !== undefined)
    out.grass_color = s.colors.grass_color;
  if (
    s.colors.dry_foliage_color !== undefined &&
    version.dataVersion >= DRY_FOLIAGE_DATA_VERSION
  ) {
    out.dry_foliage_color = s.colors.dry_foliage_color;
  }
  if (s.grassModifier !== undefined) out.grass_color_modifier = s.grassModifier;
  return out;
}

function musicJson(entry: MusicEntry): Record<string, unknown> {
  return {
    sound: entry.sound.render(),
    min_delay: entry.minDelay,
    max_delay: entry.maxDelay,
    replace_current_music: entry.replaceCurrentMusic ?? false,
  };
}

/** The `effects` object for `version` (pre-1.21.11 shape includes ambience). */
export function effectsJson(
  s: EffectsState,
  version: VersionProfile,
): Record<string, unknown> {
  const out = tintJson(s, version);
  if (version.dataVersion >= ATTRIBUTES_DATA_VERSION) return out;

  for (const key of ["sky_color", "fog_color", "water_fog_color"] as const) {
    if (s.colors[key] !== undefined) out[key] = s.colors[key];
  }
  if (s.particleSpec) {
    out.particle = {
      options: s.particleSpec.options,
      probability: s.particleSpec.probability,
    };
  }
  if (s.ambient) {
    out.ambient_sound =
      s.ambient.range === undefined
        ? s.ambient.sound.render()
        : { sound_id: s.ambient.sound.render(), range: s.ambient.range };
  }
  if (s.mood) {
    out.mood_sound = {
      sound: s.mood.sound.render(),
      tick_delay: s.mood.tickDelay,
      block_search_extent: s.mood.blockSearchExtent,
      offset: s.mood.offset,
    };
  }
  if (s.additions) {
    out.additions_sound = {
      sound: s.additions.sound.render(),
      tick_chance: s.additions.tickChance,
    };
  }
  if (s.musicList.length) {
    if (version.dataVersion >= MUSIC_LIST_DATA_VERSION) {
      out.music = s.musicList.map((entry) => ({
        weight: entry.weight ?? 1,
        data: musicJson(entry),
      }));
    } else {
      out.music = musicJson(s.musicList[0]);
    }
  }
  if (
    s.volume !== undefined &&
    version.dataVersion >= MUSIC_LIST_DATA_VERSION
  ) {
    out.music_volume = s.volume;
  }
  return out;
}

/**
 * The `attributes` entries for 1.21.11+; empty on older versions, where `effectsJson`
 * has them.
 */
export function attributesJson(
  s: EffectsState,
  version: VersionProfile,
): Record<string, unknown> {
  if (version.dataVersion < ATTRIBUTES_DATA_VERSION) return {};
  const out: Record<string, unknown> = {};
  const visual = {
    fog_color: s.colors.fog_color,
    sky_color: s.colors.sky_color,
    water_fog_color: s.colors.water_fog_color,
  };
  for (const [name, value] of Object.entries(visual)) {
    if (value !== undefined) out[`minecraft:visual/${name}`] = value;
  }
  if (s.particleSpec) {
    out["minecraft:visual/ambient_particles"] = [
      {
        particle: s.particleSpec.options,
        probability: s.particleSpec.probability,
      },
    ];
  }
  const sounds: Record<string, unknown> = {};
  if (s.ambient) {
    sounds.loop =
      s.ambient.range === undefined
        ? s.ambient.sound.render()
        : { sound_id: s.ambient.sound.render(), range: s.ambient.range };
  }
  if (s.mood) {
    sounds.mood = {
      sound: s.mood.sound.render(),
      tick_delay: s.mood.tickDelay,
      block_search_extent: s.mood.blockSearchExtent,
      offset: s.mood.offset,
    };
  }
  if (s.additions) {
    sounds.additions = {
      sound: s.additions.sound.render(),
      tick_chance: s.additions.tickChance,
    };
  }
  if (Object.keys(sounds).length)
    out["minecraft:audio/ambient_sounds"] = sounds;
  if (s.musicList.length) {
    out["minecraft:audio/background_music"] = {
      default: musicJson(s.musicList[0]),
    };
  }
  if (s.volume !== undefined) out["minecraft:audio/music_volume"] = s.volume;
  return out;
}
