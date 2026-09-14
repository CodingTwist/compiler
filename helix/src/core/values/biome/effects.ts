// `BiomeEffects`: the atmosphere setters (colours, particles, sounds, music).
import { VersionProfile } from "../../../versions/profile";
import { Particle } from "../resource.generated";
import { SoundEvent } from "../sound";
import type { GrassColorModifier } from "./enums";
import { attributesJson, effectsJson } from "./effects-json";
import type { BiomeColor, EffectsState, MoodSoundOpts, MusicOpts } from "./types";

/** `"#7fa1ff"` | `0x7fa1ff` -> `8364543`. */
function packColor(color: BiomeColor): number {
  if (typeof color === "number") return color;
  const n = Number.parseInt(color.slice(1), 16);
  if (Number.isNaN(n)) throw new Error(`Invalid biome colour "${color}" (expected #RRGGBB)`);
  return n;
}

/**
 * A biome's atmosphere: colours, particles, sounds and music. Built through {@link
 * BiomeDef.effects}.
 *
 * Where each setting lands in the file depends on the version; see `ATTRIBUTES_DATA_VERSION`.
 */
export class BiomeEffects {
  private readonly s: EffectsState = { colors: {}, musicList: [] };

  /** Fog colour seen at distance. Moves to `visual/fog_color` on 1.21.11+. */
  fogColor(color: BiomeColor): this {
    this.s.colors.fog_color = packColor(color);
    return this;
  }

  /** Sky colour. Moves to `visual/sky_color` on 1.21.11+. */
  skyColor(color: BiomeColor): this {
    this.s.colors.sky_color = packColor(color);
    return this;
  }

  /** Water tint. Stays in `effects` on every version. */
  waterColor(color: BiomeColor): this {
    this.s.colors.water_color = packColor(color);
    return this;
  }

  /** Underwater fog colour. Moves to `visual/water_fog_color` on 1.21.11+. */
  waterFogColor(color: BiomeColor): this {
    this.s.colors.water_fog_color = packColor(color);
    return this;
  }

  /** Leaf tint override (default: derived from climate). */
  foliageColor(color: BiomeColor): this {
    this.s.colors.foliage_color = packColor(color);
    return this;
  }

  /** Grass tint override (default: derived from climate). */
  grassColor(color: BiomeColor): this {
    this.s.colors.grass_color = packColor(color);
    return this;
  }

  /** Dried-foliage tint. 1.21.5+; dropped on older versions. */
  dryFoliageColor(color: BiomeColor): this {
    this.s.colors.dry_foliage_color = packColor(color);
    return this;
  }

  /** One of the two built-in grass recolours (dark forest / swamp). */
  grassColorModifier(modifier: GrassColorModifier): this {
    this.s.grassModifier = modifier;
    return this;
  }

  /** An ambient particle (like a warped forest's motes), at `probability` per tick. */
  particle(particle: Particle, probability: number): this {
    return this.particleRaw({ type: particle.render() }, probability);
  }

  /**
   * Particle with extra options (`dust`, `block`…); `options` is the particle object as-is.
   */
  particleRaw(options: Record<string, unknown>, probability: number): this {
    this.s.particleSpec = { options, probability };
    return this;
  }

  /** The continuous background loop (e.g. `SoundEvent.AMBIENT_CAVE`). */
  ambientSound(sound: SoundEvent, range?: number): this {
    this.s.ambient = { sound, range };
    return this;
  }

  /** The occasional dark-cave scare sound. */
  moodSound(sound: SoundEvent, opts: MoodSoundOpts): this {
    this.s.mood = { sound, ...opts };
    return this;
  }

  /** The rare "additions" sound, rolled at `tickChance` per tick. */
  additionsSound(sound: SoundEvent, tickChance: number): this {
    this.s.additions = { sound, tickChance };
    return this;
  }

  /**
   * Adds a music track. Repeatable on 1.21.4–1.21.10 (weighted list).
   * Older versions and 1.21.11+ only use the first call.
   */
  music(sound: SoundEvent, opts: MusicOpts): this {
    this.s.musicList.push({ sound, ...opts });
    return this;
  }

  /** Music volume in this biome (**1.21.4+**), 0..1. */
  musicVolume(volume: number): this {
    this.s.volume = volume;
    return this;
  }

  /** The `effects` object for `version` (pre-1.21.11 shape includes ambience). */
  toJson(version: VersionProfile): Record<string, unknown> {
    return effectsJson(this.s, version);
  }

  /**
   * The `attributes` entries for 1.21.11+; empty on older versions, where {@link toJson}
   * has them.
   */
  attributesJson(version: VersionProfile): Record<string, unknown> {
    return attributesJson(this.s, version);
  }
}
