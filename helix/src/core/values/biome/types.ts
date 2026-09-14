// Option shapes for biome settings.
import type { IdValue } from "../id";
import type { BiomeEffects } from "./effects";
import type { CarveStep, GrassColorModifier, SpawnCategory, TemperatureModifier } from "./enums";
import { SoundEvent } from "../sound";

/** A colour: packed `0xRRGGBB` or `"#RRGGBB"`. */
export type BiomeColor = number | `#${string}`;

/** A `worldgen/placed_feature` or `worldgen/configured_carver` reference. */
export type WorldgenRef = IdValue | string;

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

export interface MusicEntry extends MusicOpts {
  sound: SoundEvent;
}

/** What `BiomeEffects` has been told, before it is shaped for a version. */
export interface EffectsState {
  colors: Partial<Record<string, number>>;
  grassModifier?: GrassColorModifier;
  particleSpec?: { options: Record<string, unknown>; probability: number };
  ambient?: { sound: SoundEvent; range?: number };
  mood?: { sound: SoundEvent } & MoodSoundOpts;
  additions?: { sound: SoundEvent; tickChance: number };
  musicList: MusicEntry[];
  volume?: number;
}

/** What `BiomeDef` has been told, before it is shaped for a version. */
export interface DefState {
  temperature: number;
  downfall: number;
  precipitation: boolean;
  temperatureModifier?: TemperatureModifier;
  creatureSpawnProbability?: number;
  effects: BiomeEffects;
  spawners: Map<SpawnCategory, Record<string, unknown>[]>;
  spawnCosts: Record<string, unknown>;
  carverRefs: Map<CarveStep, string[]>;
  featureSteps: string[][];
  attributeOverrides: Record<string, unknown>;
  rawJson?: Record<string, unknown>;
}
