// `BiomeDef`: climate, spawns, carvers and features, shaped into biome JSON per version.
import { VersionProfile } from "../../../versions/profile";
import { IdValue } from "../id";
import { EntityType } from "../resource.generated";
import { BiomeEffects } from "./effects";
import {
  CarveStep,
  DECORATION_STEP_COUNT,
  type DecorationStep,
  type SpawnCategory,
  type TemperatureModifier,
} from "./enums";
import type {
  DefState,
  SpawnCostOpts,
  SpawnerOpts,
  WorldgenRef,
} from "./types";
import { biomeJson } from "./def-json";

const renderRef = (ref: WorldgenRef): string =>
  (typeof ref === "string" ? new IdValue(ref) : ref).render();

/**
 * A biome definition, registered with `Datapack.biome`. Settings are version-agnostic;
 * `toJson` shapes them for the target.
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
  private readonly s: DefState = {
    temperature: 0.8,
    downfall: 0.4,
    precipitation: true,
    effects: new BiomeEffects(),
    spawners: new Map(),
    spawnCosts: {},
    carverRefs: new Map(),
    featureSteps: Array.from({ length: DECORATION_STEP_COUNT }, () => []),
    attributeOverrides: {},
  };

  /** Biome temperature: drives snow vs rain, grass tint and mob behaviour. */
  temperature(value: number): this {
    this.s.temperature = value;
    return this;
  }

  /** Humidity, 0..1: drives foliage tint and fire spread. */
  downfall(value: number): this {
    this.s.downfall = value;
    return this;
  }

  /** Whether weather falls here at all (`has_precipitation`). */
  precipitation(has: boolean): this {
    this.s.precipitation = has;
    return this;
  }

  /** `frozen` makes temperature vary by position (the frozen-ocean patches). */
  temperatureModifier(modifier: TemperatureModifier): this {
    this.s.temperatureModifier = modifier;
    return this;
  }

  /** Chance (0..0.9999999) that a chunk gets its passive mobs at world-gen time. */
  creatureSpawnProbability(value: number): this {
    this.s.creatureSpawnProbability = value;
    return this;
  }

  /** Configure the atmosphere (colours, particle, sounds, music). */
  effects(build: (effects: BiomeEffects) => void): this {
    build(this.s.effects);
    return this;
  }

  /** Add one natural-spawn entry to a mob category. Repeatable. */
  spawn(category: SpawnCategory, type: EntityType, opts: SpawnerOpts): this {
    const list = this.s.spawners.get(category) ?? [];
    list.push({
      type: type.render(),
      weight: opts.weight,
      minCount: opts.min,
      maxCount: opts.max,
    });
    this.s.spawners.set(category, list);
    return this;
  }

  /** A `spawn_costs` entry: density-limit `type` by potential-field charge. */
  spawnCost(type: EntityType, opts: SpawnCostOpts): this {
    this.s.spawnCosts[type.render()] = {
      energy_budget: opts.energyBudget,
      charge: opts.charge,
    };
    return this;
  }

  /**
   * Adds configured carvers. `step` only matters before 1.21.2, when air and liquid carvers
   * were separate.
   */
  carver(step: CarveStep, ...refs: WorldgenRef[]): this {
    const list = this.s.carverRefs.get(step) ?? [];
    list.push(...refs.map(renderRef));
    this.s.carverRefs.set(step, list);
    return this;
  }

  /** Add placed features to a generation step. Repeatable per step. */
  feature(step: DecorationStep, ...refs: WorldgenRef[]): this {
    this.s.featureSteps[step].push(...refs.map(renderRef));
    return this;
  }

  /**
   * Sets an environment attribute directly (1.21.11+), for ones without a setter.
   * Merged over {@link effects}; ignored on older versions.
   */
  attribute(id: string, value: unknown): this {
    this.s.attributeOverrides[id] = value;
    return this;
  }

  /** Escape hatch: merge `json` over the built object (last word wins). */
  raw(json: Record<string, unknown>): this {
    this.s.rawJson = { ...this.s.rawJson, ...json };
    return this;
  }

  /** The biome JSON, in the shape `version` expects. */
  toJson(version: VersionProfile): Record<string, unknown> {
    return biomeJson(this.s, version);
  }
}
