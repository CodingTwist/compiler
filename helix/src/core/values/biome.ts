import { VersionProfile } from "../../versions/profile";
import { IdValue } from "./id";
import { EntityType, Particle } from "./resource.generated";
import { SoundEvent } from "./sound";

// --- Version thresholds --------------------------------------------------
// The biome format has moved three times in the range helix supports. Each
// constant is the dataVersion of the snapshot the change LANDED in.

/**
 * 24w33a (1.21.2): `carvers` stopped being a per-carve-step object
 * (`{air: [...], liquid: [...]}`) and became a flat list of configured carvers.
 */
const CARVER_LIST_DATA_VERSION = 4058;

/**
 * 24w44a (1.21.4): `effects.music` became a weighted list of music entries
 * (`[{weight, data}]`) instead of a single object, and `effects.music_volume`
 * was added.
 */
const MUSIC_LIST_DATA_VERSION = 4174;

/** 25w08a (1.21.5): `effects.dry_foliage_color`. */
const DRY_FOLIAGE_DATA_VERSION = 4316;

/**
 * 25w42a (1.21.11): the big one - everything about a biome's *ambience* left
 * `effects` for the **environment attribute** map (`attributes`), keyed by
 * attribute id: `fog_color`/`sky_color`/`water_fog_color` →
 * `minecraft:visual/<name>`, `particle` → `minecraft:visual/ambient_particles`,
 * the three sound fields → one `minecraft:audio/ambient_sounds`, `music` +
 * `music_volume` → `minecraft:audio/background_music` + `.../music_volume`.
 * Only the block-tint colours (`water_color`, `grass_color`, `foliage_color`,
 * `dry_foliage_color`, `grass_color_modifier`) stayed in `effects`.
 *
 * The whole point of building a biome through this class rather than
 * `dp.registryFile`: the author says `.fogColor(...)` once and it lands in the
 * right half of the file for the target version.
 */
const ATTRIBUTES_DATA_VERSION = 4654;

/**
 * A colour as authored: a packed `0xRRGGBB` int or a `"#RRGGBB"` hex string.
 * Both render to the packed int the biome format calls `composite_rgb`.
 */
export type BiomeColor = number | `#${string}`;

/** `"#7fa1ff"` | `0x7fa1ff` -> `8364543`. */
function packColor(color: BiomeColor): number {
  if (typeof color === "number") return color;
  const n = Number.parseInt(color.slice(1), 16);
  if (Number.isNaN(n)) throw new Error(`Invalid biome colour "${color}" (expected #RRGGBB)`);
  return n;
}

/**
 * `temperature_modifier` - how the biome's temperature is post-processed.
 * Named-constant namespace + union type (declaration merging), same stance as
 * `Gamemode`: author `TemperatureModifier.FROZEN` over the bare `"frozen"`.
 */
export const TemperatureModifier = {
  NONE: "none",
  FROZEN: "frozen",
} as const;
export type TemperatureModifier = (typeof TemperatureModifier)[keyof typeof TemperatureModifier];

/** `effects.grass_color_modifier` - the built-in grass recolour hacks. */
export const GrassColorModifier = {
  NONE: "none",
  /** Averaged with `#28340a`. */
  DARK_FOREST: "dark_forest",
  /** Position-dependent `#4c763c` / `#6a7039`; the base colour is ignored. */
  SWAMP: "swamp",
} as const;
export type GrassColorModifier = (typeof GrassColorModifier)[keyof typeof GrassColorModifier];

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
 * The 11 world-generation steps, in order. `features` is a list of lists
 * positional on this order, so the author names the step
 * (`DecorationStep.VEGETAL_DECORATION`) and never writes an index.
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
export type DecorationStep = (typeof DecorationStep)[keyof typeof DecorationStep];

const DECORATION_STEP_COUNT = 11;

/** The two carve steps of the pre-1.21.2 `carvers` object form. */
export const CarveStep = {
  AIR: "air",
  LIQUID: "liquid",
} as const;
export type CarveStep = (typeof CarveStep)[keyof typeof CarveStep];

/** A `worldgen/placed_feature` or `worldgen/configured_carver` reference. */
export type WorldgenRef = IdValue | string;

const renderRef = (ref: WorldgenRef): string =>
  (typeof ref === "string" ? new IdValue(ref) : ref).render();

/** One `spawners` entry: how often and in what group size a mob spawns. */
export interface SpawnerOpts {
  /** Selection weight against the other entries in the same category. */
  weight: number;
  /** Smallest pack size (`minCount`). */
  min: number;
  /** Largest pack size (`maxCount`). */
  max: number;
}

/** A `spawn_costs` entry - the charge-based density limiter. */
export interface SpawnCostOpts {
  energyBudget: number;
  charge: number;
}

/** `mood_sound` - the "cave ambience" jump-scare timer. */
export interface MoodSoundOpts {
  /** Ticks of darkness before the sound may play (vanilla caves: 6000). */
  tickDelay: number;
  /** Half-extent of the box searched for dark blocks (vanilla caves: 8). */
  blockSearchExtent: number;
  /** How far from the player the sound is placed (vanilla caves: 2). */
  offset: number;
}

/** One `music` entry - a track and how long the game waits between plays. */
export interface MusicOpts {
  minDelay: number;
  maxDelay: number;
  /** Cut the currently playing track off instead of waiting for it to end. */
  replaceCurrentMusic?: boolean;
  /** Weight against the other tracks (1.21.4+ weighted list only). */
  weight?: number;
}

interface MusicEntry extends MusicOpts {
  sound: SoundEvent;
}

/**
 * The atmosphere half of a biome: colours, ambient particle, the four sound
 * slots and the music. Built through {@link BiomeDef.effects}; you never
 * construct it directly.
 *
 * Which *file* half each setter ends up in is version-dependent (see
 * {@link ATTRIBUTES_DATA_VERSION}) - the setters are the stable surface.
 */
export class BiomeEffects {
  private colors: Partial<Record<string, number>> = {};
  private grassModifier?: GrassColorModifier;
  private particleSpec?: { options: Record<string, unknown>; probability: number };
  private ambient?: { sound: SoundEvent; range?: number };
  private mood?: { sound: SoundEvent } & MoodSoundOpts;
  private additions?: { sound: SoundEvent; tickChance: number };
  private musicList: MusicEntry[] = [];
  private volume?: number;

  /** Fog colour seen at distance. Moves to `visual/fog_color` on 1.21.11+. */
  fogColor(color: BiomeColor): this {
    this.colors.fog_color = packColor(color);
    return this;
  }

  /** Sky colour. Moves to `visual/sky_color` on 1.21.11+. */
  skyColor(color: BiomeColor): this {
    this.colors.sky_color = packColor(color);
    return this;
  }

  /** Water tint. Stays in `effects` on every version. */
  waterColor(color: BiomeColor): this {
    this.colors.water_color = packColor(color);
    return this;
  }

  /** Underwater fog colour. Moves to `visual/water_fog_color` on 1.21.11+. */
  waterFogColor(color: BiomeColor): this {
    this.colors.water_fog_color = packColor(color);
    return this;
  }

  /** Leaf tint override (default: derived from climate). */
  foliageColor(color: BiomeColor): this {
    this.colors.foliage_color = packColor(color);
    return this;
  }

  /** Grass tint override (default: derived from climate). */
  grassColor(color: BiomeColor): this {
    this.colors.grass_color = packColor(color);
    return this;
  }

  /** Dried-foliage tint. **1.21.5+**; silently dropped on older versions. */
  dryFoliageColor(color: BiomeColor): this {
    this.colors.dry_foliage_color = packColor(color);
    return this;
  }

  /** One of the two built-in grass recolours (dark forest / swamp). */
  grassColorModifier(modifier: GrassColorModifier): this {
    this.grassModifier = modifier;
    return this;
  }

  /** An ambient particle (like a warped forest's motes), at `probability` per tick. */
  particle(particle: Particle, probability: number): this {
    return this.particleRaw({ type: particle.render() }, probability);
  }

  /**
   * Escape hatch for particles that need options beyond their id (`dust`,
   * `block`, ...): `options` is the particle object verbatim.
   */
  particleRaw(options: Record<string, unknown>, probability: number): this {
    this.particleSpec = { options, probability };
    return this;
  }

  /** The continuous background loop (e.g. `SoundEvent.AMBIENT_CAVE`). */
  ambientSound(sound: SoundEvent, range?: number): this {
    this.ambient = { sound, range };
    return this;
  }

  /** The occasional dark-cave scare sound. */
  moodSound(sound: SoundEvent, opts: MoodSoundOpts): this {
    this.mood = { sound, ...opts };
    return this;
  }

  /** The rare "additions" sound, rolled at `tickChance` per tick. */
  additionsSound(sound: SoundEvent, tickChance: number): this {
    this.additions = { sound, tickChance };
    return this;
  }

  /**
   * A music track for the biome. Repeatable on 1.21.4-1.21.10, where music is a
   * weighted list; on older versions only the first call is emitted, and on
   * 1.21.11+ the first call becomes the attribute's `default` track (extra
   * calls are dropped - that format picks tracks by context, not by weight).
   */
  music(sound: SoundEvent, opts: MusicOpts): this {
    this.musicList.push({ sound, ...opts });
    return this;
  }

  /** Music volume in this biome (**1.21.4+**), 0..1. */
  musicVolume(volume: number): this {
    this.volume = volume;
    return this;
  }

  /** The colours that stay in `effects` on every version. */
  private tintJson(version: VersionProfile): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (this.colors.water_color !== undefined) out.water_color = this.colors.water_color;
    if (this.colors.foliage_color !== undefined) out.foliage_color = this.colors.foliage_color;
    if (this.colors.grass_color !== undefined) out.grass_color = this.colors.grass_color;
    if (
      this.colors.dry_foliage_color !== undefined &&
      version.dataVersion >= DRY_FOLIAGE_DATA_VERSION
    ) {
      out.dry_foliage_color = this.colors.dry_foliage_color;
    }
    if (this.grassModifier !== undefined) out.grass_color_modifier = this.grassModifier;
    return out;
  }

  private musicJson(entry: MusicEntry): Record<string, unknown> {
    return {
      sound: entry.sound.render(),
      min_delay: entry.minDelay,
      max_delay: entry.maxDelay,
      replace_current_music: entry.replaceCurrentMusic ?? false,
    };
  }

  /** The `effects` object for `version` (pre-1.21.11 shape includes ambience). */
  toJson(version: VersionProfile): Record<string, unknown> {
    const out = this.tintJson(version);
    if (version.dataVersion >= ATTRIBUTES_DATA_VERSION) return out;

    for (const key of ["sky_color", "fog_color", "water_fog_color"] as const) {
      if (this.colors[key] !== undefined) out[key] = this.colors[key];
    }
    if (this.particleSpec) {
      out.particle = {
        options: this.particleSpec.options,
        probability: this.particleSpec.probability,
      };
    }
    if (this.ambient) {
      out.ambient_sound =
        this.ambient.range === undefined
          ? this.ambient.sound.render()
          : { sound_id: this.ambient.sound.render(), range: this.ambient.range };
    }
    if (this.mood) {
      out.mood_sound = {
        sound: this.mood.sound.render(),
        tick_delay: this.mood.tickDelay,
        block_search_extent: this.mood.blockSearchExtent,
        offset: this.mood.offset,
      };
    }
    if (this.additions) {
      out.additions_sound = {
        sound: this.additions.sound.render(),
        tick_chance: this.additions.tickChance,
      };
    }
    if (this.musicList.length) {
      if (version.dataVersion >= MUSIC_LIST_DATA_VERSION) {
        out.music = this.musicList.map((entry) => ({
          weight: entry.weight ?? 1,
          data: this.musicJson(entry),
        }));
      } else {
        out.music = this.musicJson(this.musicList[0]);
      }
    }
    if (this.volume !== undefined && version.dataVersion >= MUSIC_LIST_DATA_VERSION) {
      out.music_volume = this.volume;
    }
    return out;
  }

  /**
   * The `attributes` entries this ambience contributes on 1.21.11+ (empty on
   * older versions, where {@link toJson} carries the same settings instead).
   */
  attributesJson(version: VersionProfile): Record<string, unknown> {
    if (version.dataVersion < ATTRIBUTES_DATA_VERSION) return {};
    const out: Record<string, unknown> = {};
    const visual = {
      fog_color: this.colors.fog_color,
      sky_color: this.colors.sky_color,
      water_fog_color: this.colors.water_fog_color,
    };
    for (const [name, value] of Object.entries(visual)) {
      if (value !== undefined) out[`minecraft:visual/${name}`] = value;
    }
    if (this.particleSpec) {
      out["minecraft:visual/ambient_particles"] = [
        { particle: this.particleSpec.options, probability: this.particleSpec.probability },
      ];
    }
    const sounds: Record<string, unknown> = {};
    if (this.ambient) {
      sounds.loop =
        this.ambient.range === undefined
          ? this.ambient.sound.render()
          : { sound_id: this.ambient.sound.render(), range: this.ambient.range };
    }
    if (this.mood) {
      sounds.mood = {
        sound: this.mood.sound.render(),
        tick_delay: this.mood.tickDelay,
        block_search_extent: this.mood.blockSearchExtent,
        offset: this.mood.offset,
      };
    }
    if (this.additions) {
      sounds.additions = {
        sound: this.additions.sound.render(),
        tick_chance: this.additions.tickChance,
      };
    }
    if (Object.keys(sounds).length) out["minecraft:audio/ambient_sounds"] = sounds;
    if (this.musicList.length) {
      out["minecraft:audio/background_music"] = { default: this.musicJson(this.musicList[0]) };
    }
    if (this.volume !== undefined) out["minecraft:audio/music_volume"] = this.volume;
    return out;
  }
}

/**
 * A registerable **biome definition** - the JSON written to
 * `data/<ns>/worldgen/biome/<name>.json` (via `Datapack.biome`) and referenced
 * as a {@link Biome} from `/fillbiome`, a dimension's biome source, or another
 * pack.
 *
 * Everything an author sets is version-agnostic; `toJson` places it in the
 * shape the target version wants (see the data-version constants at the top of
 * this file - `effects` vs `attributes`, weighted vs single music, list vs
 * per-step carvers).
 *
 *   dp.biome("minecraft:plains",                 // override a vanilla biome
 *     new BiomeDef()
 *       .temperature(0.8).downfall(0.4).precipitation(true)
 *       .effects((e) => e
 *         .skyColor("#78a7ff").fogColor("#c0d8ff")
 *         .waterColor("#3f76e4").waterFogColor("#050533")
 *         .ambientSound(SoundEvent.AMBIENT_CAVE))
 *       .spawn(SpawnCategory.CREATURE, EntityType.SHEEP, { weight: 12, min: 4, max: 4 })
 *       .feature(DecorationStep.VEGETAL_DECORATION, "minecraft:patch_grass_plain"));
 */
export class BiomeDef {
  private temperatureValue = 0.8;
  private downfallValue = 0.4;
  private precipitationValue = true;
  private temperatureModifierValue?: TemperatureModifier;
  private creatureSpawnProbabilityValue?: number;
  private readonly effectsBuilder = new BiomeEffects();
  private readonly spawners = new Map<SpawnCategory, Record<string, unknown>[]>();
  private readonly spawnCosts: Record<string, unknown> = {};
  private readonly carverRefs = new Map<CarveStep, string[]>();
  private readonly featureSteps: string[][] = Array.from(
    { length: DECORATION_STEP_COUNT },
    () => [],
  );
  private readonly attributeOverrides: Record<string, unknown> = {};
  private rawJson?: Record<string, unknown>;

  /** Biome temperature: drives snow vs rain, grass tint and mob behaviour. */
  temperature(value: number): this {
    this.temperatureValue = value;
    return this;
  }

  /** Humidity, 0..1: drives foliage tint and fire spread. */
  downfall(value: number): this {
    this.downfallValue = value;
    return this;
  }

  /** Whether weather falls here at all (`has_precipitation`). */
  precipitation(has: boolean): this {
    this.precipitationValue = has;
    return this;
  }

  /** `frozen` makes temperature vary by position (the frozen-ocean patches). */
  temperatureModifier(modifier: TemperatureModifier): this {
    this.temperatureModifierValue = modifier;
    return this;
  }

  /** Chance (0..0.9999999) that a chunk gets its passive mobs at world-gen time. */
  creatureSpawnProbability(value: number): this {
    this.creatureSpawnProbabilityValue = value;
    return this;
  }

  /** Configure the atmosphere (colours, particle, sounds, music). */
  effects(build: (effects: BiomeEffects) => void): this {
    build(this.effectsBuilder);
    return this;
  }

  /** Add one natural-spawn entry to a mob category. Repeatable. */
  spawn(category: SpawnCategory, type: EntityType, opts: SpawnerOpts): this {
    const list = this.spawners.get(category) ?? [];
    list.push({
      type: type.render(),
      weight: opts.weight,
      minCount: opts.min,
      maxCount: opts.max,
    });
    this.spawners.set(category, list);
    return this;
  }

  /** A `spawn_costs` entry: density-limit `type` by potential-field charge. */
  spawnCost(type: EntityType, opts: SpawnCostOpts): this {
    this.spawnCosts[type.render()] = { energy_budget: opts.energyBudget, charge: opts.charge };
    return this;
  }

  /**
   * Add configured carvers (caves/canyons). `step` only matters pre-1.21.2,
   * where carvers were split into an air and a liquid pass; from 1.21.2 the
   * steps are merged into one list in call order.
   */
  carver(step: CarveStep, ...refs: WorldgenRef[]): this {
    const list = this.carverRefs.get(step) ?? [];
    list.push(...refs.map(renderRef));
    this.carverRefs.set(step, list);
    return this;
  }

  /** Add placed features to a generation step. Repeatable per step. */
  feature(step: DecorationStep, ...refs: WorldgenRef[]): this {
    this.featureSteps[step].push(...refs.map(renderRef));
    return this;
  }

  /**
   * Set an **environment attribute** directly (1.21.11+), for the attributes
   * that have no dedicated setter here - `visual/cloud_height`,
   * `gameplay/monsters_burn`, a `{modifier, argument}` object, ... Merged over
   * whatever {@link effects} contributed; ignored on older versions, which have
   * no attribute map.
   */
  attribute(id: string, value: unknown): this {
    this.attributeOverrides[id] = value;
    return this;
  }

  /** Escape hatch: merge `json` over the built object (last word wins). */
  raw(json: Record<string, unknown>): this {
    this.rawJson = { ...this.rawJson, ...json };
    return this;
  }

  /** The biome JSON, in the shape `version` expects. */
  toJson(version: VersionProfile): Record<string, unknown> {
    const out: Record<string, unknown> = {
      has_precipitation: this.precipitationValue,
      temperature: this.temperatureValue,
      downfall: this.downfallValue,
      effects: this.effectsBuilder.toJson(version),
    };
    if (this.temperatureModifierValue !== undefined) {
      out.temperature_modifier = this.temperatureModifierValue;
    }
    if (this.creatureSpawnProbabilityValue !== undefined) {
      out.creature_spawn_probability = this.creatureSpawnProbabilityValue;
    }

    const attributes = {
      ...this.effectsBuilder.attributesJson(version),
      ...(version.dataVersion >= ATTRIBUTES_DATA_VERSION ? this.attributeOverrides : {}),
    };
    if (Object.keys(attributes).length) out.attributes = attributes;

    const spawners: Record<string, unknown> = {};
    for (const [category, entries] of this.spawners) spawners[category] = entries;
    out.spawners = spawners;
    out.spawn_costs = this.spawnCosts;

    const air = this.carverRefs.get(CarveStep.AIR) ?? [];
    const liquid = this.carverRefs.get(CarveStep.LIQUID) ?? [];
    if (version.dataVersion >= CARVER_LIST_DATA_VERSION) {
      out.carvers = [...air, ...liquid];
    } else {
      const carvers: Record<string, unknown> = {};
      if (air.length) carvers[CarveStep.AIR] = air;
      if (liquid.length) carvers[CarveStep.LIQUID] = liquid;
      out.carvers = carvers;
    }

    out.features = this.featureSteps.map((step) => [...step]);
    return this.rawJson ? { ...out, ...this.rawJson } : out;
  }
}
