import { describe, it, expect } from "vitest";
import { Datapack } from "../ir/datapack";
import { buildDatapack } from "../codegen/codegen";
import { v1_20_4 } from "../../versions/profiles";
import { v1_21_4 } from "../../versions/profiles";
import { v26_2 } from "../../versions/profiles";
import { EntityType, Particle } from "./resource.generated";
import { SoundEvent } from "./sound";
import {
  BiomeDef,
  CarveStep,
  DecorationStep,
  GrassColorModifier,
  SpawnCategory,
  TemperatureModifier,
} from "./biome";

/** Build `dp` and return the parsed JSON at `path` (fails if missing). */
function emitted(dp: Datapack, path: string): any {
  const files = buildDatapack(dp);
  expect(files.has(path), `expected file ${path}`).toBe(true);
  return JSON.parse(files.get(path)!);
}

/** A biome exercising every part of the surface, for the version-split tests. */
const fullBiome = () =>
  new BiomeDef()
    .temperature(0.6)
    .downfall(0.7)
    .precipitation(true)
    .temperatureModifier(TemperatureModifier.FROZEN)
    .creatureSpawnProbability(0.07)
    .effects((e) =>
      e
        .skyColor("#78a7ff")
        .fogColor(0xc0d8ff)
        .waterColor("#3f76e4")
        .waterFogColor("#050533")
        .foliageColor("#59ae30")
        .grassColor("#79c05a")
        .dryFoliageColor("#a2823c")
        .grassColorModifier(GrassColorModifier.DARK_FOREST)
        .particle(Particle.WHITE_ASH, 0.118093334)
        .ambientSound(SoundEvent.AMBIENT_CAVE)
        .moodSound(SoundEvent.AMBIENT_CAVE, {
          tickDelay: 6000,
          blockSearchExtent: 8,
          offset: 2,
        })
        .additionsSound(SoundEvent.AMBIENT_BASALT_DELTAS_ADDITIONS, 0.0111)
        .music(SoundEvent.MUSIC_OVERWORLD_JUNGLE, { minDelay: 12000, maxDelay: 24000, weight: 3 })
        .musicVolume(0.8),
    )
    .spawn(SpawnCategory.CREATURE, EntityType.SHEEP, { weight: 12, min: 4, max: 4 })
    .spawn(SpawnCategory.MONSTER, EntityType.ZOMBIE, { weight: 95, min: 1, max: 4 })
    .spawnCost(EntityType.ZOMBIE, { energyBudget: 0.12, charge: 1 })
    .carver(CarveStep.AIR, "minecraft:cave", "minecraft:canyon")
    .carver(CarveStep.LIQUID, "minecraft:underwater_cave")
    .feature(DecorationStep.LAKES, "minecraft:lake_lava_underground")
    .feature(DecorationStep.VEGETAL_DECORATION, "minecraft:patch_grass_plain");

describe("biome definitions", () => {
  it("emits the full definition to worldgen/biome under the pack namespace", () => {
    const dp = new Datapack("testpack", v1_21_4);
    const ref = dp.biome("custom/glade", fullBiome());
    expect(ref.render()).toBe("testpack:custom/glade");

    const json = emitted(dp, "data/testpack/worldgen/biome/custom/glade.json");
    expect(json).toMatchObject({
      has_precipitation: true,
      temperature: 0.6,
      downfall: 0.7,
      temperature_modifier: "frozen",
      creature_spawn_probability: 0.07,
    });

    // Colours are packed ints whichever notation the author used.
    expect(json.effects.sky_color).toBe(0x78a7ff);
    expect(json.effects.fog_color).toBe(0xc0d8ff);
    expect(json.effects.grass_color_modifier).toBe("dark_forest");
    expect(json.effects.particle).toEqual({
      options: { type: "minecraft:white_ash" },
      probability: 0.118093334,
    });
    expect(json.effects.ambient_sound).toBe("minecraft:ambient.cave");
    expect(json.effects.mood_sound).toEqual({
      sound: "minecraft:ambient.cave",
      tick_delay: 6000,
      block_search_extent: 8,
      offset: 2,
    });

    // Spawners grouped by category, with the vanilla camelCase count keys.
    expect(json.spawners.creature).toEqual([
      { type: "minecraft:sheep", weight: 12, minCount: 4, maxCount: 4 },
    ]);
    expect(json.spawn_costs).toEqual({
      "minecraft:zombie": { energy_budget: 0.12, charge: 1 },
    });

    // Features are 11 positional steps, filled at the named indices only.
    expect(json.features).toHaveLength(11);
    expect(json.features[DecorationStep.LAKES]).toEqual(["minecraft:lake_lava_underground"]);
    expect(json.features[DecorationStep.VEGETAL_DECORATION]).toEqual([
      "minecraft:patch_grass_plain",
    ]);
    expect(json.features[DecorationStep.STRONGHOLDS]).toEqual([]);
  });

  it("writes into another namespace when the name carries one (vanilla override)", () => {
    const dp = new Datapack("testpack", v1_21_4);
    const ref = dp.biome("minecraft:plains", new BiomeDef().temperature(0.8));
    expect(ref.render()).toBe("minecraft:plains");

    const files = buildDatapack(dp);
    expect(files.has("data/minecraft/worldgen/biome/plains.json")).toBe(true);
    expect(files.has("data/testpack/worldgen/biome/minecraft:plains.json")).toBe(false);
  });

  it("uses the 1.21.4 weighted music list, flat carvers and no dry foliage", () => {
    const json = emitted(
      (() => {
        const dp = new Datapack("testpack", v1_21_4);
        dp.biome("x", fullBiome());
        return dp;
      })(),
      "data/testpack/worldgen/biome/x.json",
    );

    expect(json.music).toBeUndefined();
    expect(json.effects.music).toEqual([
      {
        weight: 3,
        data: {
          sound: "minecraft:music.overworld.jungle",
          min_delay: 12000,
          max_delay: 24000,
          replace_current_music: false,
        },
      },
    ]);
    expect(json.effects.music_volume).toBe(0.8);
    // dry_foliage_color is 1.21.5+.
    expect(json.effects.dry_foliage_color).toBeUndefined();
    // Carvers merged into one list from 1.21.2.
    expect(json.carvers).toEqual([
      "minecraft:cave",
      "minecraft:canyon",
      "minecraft:underwater_cave",
    ]);
    expect(json.attributes).toBeUndefined();
  });

  it("uses the pre-1.21.2 single music object and per-step carvers", () => {
    const dp = new Datapack("testpack", v1_20_4);
    dp.biome("x", fullBiome());
    const json = emitted(dp, "data/testpack/worldgen/biome/x.json");

    expect(json.effects.music).toMatchObject({
      sound: "minecraft:music.overworld.jungle",
      min_delay: 12000,
    });
    expect(json.effects.music_volume).toBeUndefined();
    expect(json.carvers).toEqual({
      air: ["minecraft:cave", "minecraft:canyon"],
      liquid: ["minecraft:underwater_cave"],
    });
  });

  it("moves ambience into environment attributes on 1.21.11+", () => {
    const dp = new Datapack("testpack", v26_2);
    dp.biome("x", fullBiome());
    const json = emitted(dp, "data/testpack/worldgen/biome/x.json");

    // The tint colours stay in effects; everything else moved.
    expect(json.effects.water_color).toBe(0x3f76e4);
    expect(json.effects.dry_foliage_color).toBe(0xa2823c);
    expect(json.effects.sky_color).toBeUndefined();
    expect(json.effects.ambient_sound).toBeUndefined();
    expect(json.effects.music).toBeUndefined();

    expect(json.attributes["minecraft:visual/sky_color"]).toBe(0x78a7ff);
    expect(json.attributes["minecraft:visual/fog_color"]).toBe(0xc0d8ff);
    expect(json.attributes["minecraft:visual/ambient_particles"]).toEqual([
      { particle: { type: "minecraft:white_ash" }, probability: 0.118093334 },
    ]);
    expect(json.attributes["minecraft:audio/ambient_sounds"]).toEqual({
      loop: "minecraft:ambient.cave",
      mood: {
        sound: "minecraft:ambient.cave",
        tick_delay: 6000,
        block_search_extent: 8,
        offset: 2,
      },
      additions: {
        sound: "minecraft:ambient.basalt_deltas.additions",
        tick_chance: 0.0111,
      },
    });
    expect(json.attributes["minecraft:audio/background_music"].default).toMatchObject({
      sound: "minecraft:music.overworld.jungle",
    });
    expect(json.attributes["minecraft:audio/music_volume"]).toBe(0.8);
  });

  it("takes attribute overrides on 1.21.11+ and drops them on older versions", () => {
    const def = () => new BiomeDef().attribute("minecraft:visual/cloud_height", 192);

    const modern = new Datapack("testpack", v26_2);
    modern.biome("x", def());
    expect(
      emitted(modern, "data/testpack/worldgen/biome/x.json").attributes[
        "minecraft:visual/cloud_height"
      ],
    ).toBe(192);

    const legacy = new Datapack("testpack", v1_21_4);
    legacy.biome("x", def());
    expect(emitted(legacy, "data/testpack/worldgen/biome/x.json").attributes).toBeUndefined();
  });

  it("merges raw() over the built object", () => {
    const dp = new Datapack("testpack", v1_21_4);
    dp.biome("x", new BiomeDef().temperature(0.5).raw({ temperature: 2, custom: true }));
    const json = emitted(dp, "data/testpack/worldgen/biome/x.json");
    expect(json.temperature).toBe(2);
    expect(json.custom).toBe(true);
  });

  it("throws when a name is reused with a different definition", () => {
    const dp = new Datapack("testpack", v1_21_4);
    const def = new BiomeDef();
    dp.biome("x", def);
    expect(() => dp.biome("x", def)).not.toThrow();
    expect(() => dp.biome("x", new BiomeDef())).toThrow(/already registered/);
  });
});
