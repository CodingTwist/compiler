// Shapes a `BiomeDef` into the biome JSON a version expects.
import { VersionProfile } from "../../../versions/profile";
import { CarveStep } from "./enums";
import type { DefState } from "./types";
import { ATTRIBUTES_DATA_VERSION, CARVER_LIST_DATA_VERSION } from "./versions";

/** The biome JSON, in the shape `version` expects. */
export function biomeJson(
  s: DefState,
  version: VersionProfile,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    has_precipitation: s.precipitation,
    temperature: s.temperature,
    downfall: s.downfall,
    effects: s.effects.toJson(version),
  };
  if (s.temperatureModifier !== undefined) {
    out.temperature_modifier = s.temperatureModifier;
  }
  if (s.creatureSpawnProbability !== undefined) {
    out.creature_spawn_probability = s.creatureSpawnProbability;
  }

  const attributes = {
    ...s.effects.attributesJson(version),
    ...(version.dataVersion >= ATTRIBUTES_DATA_VERSION
      ? s.attributeOverrides
      : {}),
  };
  if (Object.keys(attributes).length) out.attributes = attributes;

  const spawners: Record<string, unknown> = {};
  for (const [category, entries] of s.spawners) spawners[category] = entries;
  out.spawners = spawners;
  out.spawn_costs = s.spawnCosts;

  const air = s.carverRefs.get(CarveStep.AIR) ?? [];
  const liquid = s.carverRefs.get(CarveStep.LIQUID) ?? [];
  if (version.dataVersion >= CARVER_LIST_DATA_VERSION) {
    out.carvers = [...air, ...liquid];
  } else {
    const carvers: Record<string, unknown> = {};
    if (air.length) carvers[CarveStep.AIR] = air;
    if (liquid.length) carvers[CarveStep.LIQUID] = liquid;
    out.carvers = carvers;
  }

  out.features = s.featureSteps.map((step) => [...step]);
  return s.rawJson ? { ...out, ...s.rawJson } : out;
}
