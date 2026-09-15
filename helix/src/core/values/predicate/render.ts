import type { VersionProfile } from "../../../versions/profile";
import { DV } from "../entity-versions.generated";
import { Id } from "../id";
import {
  CONDITION_TYPE_DATA_VERSION,
  ENTITY_TYPE_KEY_DATA_VERSION,
} from "./versions";
import type {
  Bound,
  EntityFlags,
  EntityPredicateSpec,
  LocationSpec,
  PredicateJson,
} from "./types";

/** The first version each newer flag exists in (vanilla-mcdoc `EntityFlagsPredicate`). */
const FLAG_SINCE: Partial<Record<keyof EntityFlags, keyof typeof DV>> = {
  is_on_ground: "1.21",
  is_flying: "1.21",
  is_in_water: "1.21.11",
  is_fall_flying: "1.21.11",
};

function bound(b: Bound): unknown {
  return typeof b === "number" ? b : { min: b.min, max: b.max };
}

/** The condition id field: `condition` before 26.3, `type` since. */
export function conditionKey(
  version: VersionProfile,
  id: string,
): PredicateJson {
  return version.dataVersion >= CONDITION_TYPE_DATA_VERSION
    ? { type: `minecraft:${id}` }
    : { condition: `minecraft:${id}` };
}

export function idStr(x: string | Id): string {
  return typeof x === "string" ? Id(x).render() : x.render();
}

export function renderLocation(
  spec: LocationSpec,
  _version: VersionProfile,
): PredicateJson {
  const out: PredicateJson = {};
  if (spec.biome !== undefined) out.biome = idStr(spec.biome);
  if (spec.dimension !== undefined) out.dimension = idStr(spec.dimension);
  if (spec.structure !== undefined) out.structure = idStr(spec.structure);
  if (spec.block !== undefined) {
    out.block =
      typeof spec.block === "string"
        ? { blocks: idStr(spec.block) }
        : { blocks: spec.block.render() };
  }
  if (spec.position) {
    const p: PredicateJson = {};
    if (spec.position.x !== undefined) p.x = bound(spec.position.x);
    if (spec.position.y !== undefined) p.y = bound(spec.position.y);
    if (spec.position.z !== undefined) p.z = bound(spec.position.z);
    out.position = p;
  }
  return out;
}

export function renderEntitySpec(
  spec: EntityPredicateSpec,
  version: VersionProfile,
): PredicateJson {
  const out: PredicateJson = {};
  if (spec.type !== undefined)
    out[version.dataVersion >= ENTITY_TYPE_KEY_DATA_VERSION ? "entity_type" : "type"] = idStr(spec.type);
  if (spec.nbt !== undefined) out.nbt = spec.nbt.render(version);
  if (spec.team !== undefined) out.team = spec.team;
  if (spec.flags) {
    const flags: PredicateJson = {};
    for (const [k, val] of Object.entries(spec.flags)) {
      if (val === undefined) continue;
      const since = FLAG_SINCE[k as keyof EntityFlags];
      if (since && version.dataVersion < DV[since]) {
        throw new Error(
          `Predicate flag ${k} needs ${since}+, but the pack targets ${version.id}`,
        );
      }
      flags[k] = val;
    }
    if (Object.keys(flags).length) out.flags = flags;
  }
  if (spec.equipment) {
    const eq: PredicateJson = {};
    for (const [slot, item] of Object.entries(spec.equipment)) {
      if (item) eq[slot] = item.toPredicate(version);
    }
    if (Object.keys(eq).length) out.equipment = eq;
  }
  if (spec.slots) {
    const slots: PredicateJson = {};
    for (const [range, item] of Object.entries(spec.slots)) {
      if (item) slots[range] = item.toPredicate(version);
    }
    if (Object.keys(slots).length) out.slots = slots;
  }
  if (spec.location) out.location = renderLocation(spec.location, version);
  if (spec.vehicle) out.vehicle = renderEntitySpec(spec.vehicle, version);
  if (spec.passenger) out.passenger = renderEntitySpec(spec.passenger, version);
  return out;
}
