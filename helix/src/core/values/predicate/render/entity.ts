import type { VersionProfile } from "../../../../versions/profile";
import type { EntityFlags, EntityPredicateSpec, PredicateJson } from "../types";
import { ENTITY_TYPE_KEY_DATA_VERSION } from "../versions";
import { fields, idList, idStr, since, type Since } from "./common";
import { renderLocation } from "./location";
import { renderTypeSpecific } from "./type-specific";

/** The first version each newer flag exists in (vanilla-mcdoc `EntityFlagsPredicate`). */
const FLAG_SINCE: Partial<Record<keyof EntityFlags, Since>> = {
  is_on_ground: "1.21",
  is_flying: "1.21",
  is_in_water: "1.21.11",
  is_fall_flying: "1.21.11",
};

/** Id-keyed item matches, for `equipment` and `slots`. */
function items(
  m: Record<string, { toPredicate(v: VersionProfile): unknown } | undefined>,
  version: VersionProfile,
): PredicateJson | undefined {
  const out: PredicateJson = {};
  for (const [k, item] of Object.entries(m)) {
    if (item) out[k] = item.toPredicate(version);
  }
  return Object.keys(out).length ? out : undefined;
}

export function renderEntitySpec(
  spec: EntityPredicateSpec,
  version: VersionProfile,
): PredicateJson {
  const out: PredicateJson = {};
  const gate = (from: Since, what: string, set: unknown) => {
    if (set !== undefined) since(version, from, what);
    return set !== undefined;
  };
  if (spec.type !== undefined) {
    const key = version.dataVersion >= ENTITY_TYPE_KEY_DATA_VERSION ? "entity_type" : "type";
    out[key] = idList(spec.type, version, "type");
  }
  if (spec.nbt !== undefined) out.nbt = spec.nbt.render(version);
  if (spec.team !== undefined) out.team = spec.team;
  if (spec.flags) {
    const flags: PredicateJson = {};
    for (const [k, val] of Object.entries(spec.flags)) {
      if (val === undefined) continue;
      const from = FLAG_SINCE[k as keyof EntityFlags];
      if (from) since(version, from, `flag ${k}`);
      flags[k] = val;
    }
    if (Object.keys(flags).length) out.flags = flags;
  }
  if (spec.equipment) out.equipment = items({ ...spec.equipment }, version);
  if (spec.slots) out.slots = items({ ...spec.slots }, version);
  if (spec.location) out.location = renderLocation(spec.location, version);
  if (gate("1.17", "steppingOn", spec.steppingOn)) {
    out.stepping_on = renderLocation(spec.steppingOn!, version);
  }
  if (gate("1.21", "movementAffectedBy", spec.movementAffectedBy)) {
    out.movement_affected_by = renderLocation(spec.movementAffectedBy!, version);
  }
  if (spec.distance) {
    out.distance = fields(spec.distance, ["x", "y", "z", "absolute", "horizontal"]);
  }
  if (spec.effects) {
    out.effects = Object.fromEntries(
      spec.effects.map(({ effect, ...e }) => [
        idStr(effect),
        fields(e, ["amplifier", "duration", "ambient", "visible"]),
      ]),
    );
  }
  if (gate("1.21", "movement", spec.movement)) {
    out.movement = fields(spec.movement!, [
      "x", "y", "z", "speed", "horizontalSpeed", "verticalSpeed", "fallDistance",
    ]);
  }
  if (gate("1.21", "periodicTick", spec.periodicTick)) out.periodic_tick = spec.periodicTick;
  if (gate("26.2", "entityTags", spec.entityTags)) {
    const t = spec.entityTags!;
    out.entity_tags = { any_of: t.anyOf, all_of: t.allOf, none_of: t.noneOf };
  }
  if (gate("1.21.5", "components", spec.components)) out.components = spec.components;
  if (gate("1.21.5", "predicates", spec.predicates)) out.predicates = spec.predicates;
  if (spec.typeSpecific) {
    const [key, json] = renderTypeSpecific(spec.typeSpecific, version, renderEntitySpec);
    out[key] = json;
  }
  if (gate("1.16", "vehicle", spec.vehicle)) out.vehicle = renderEntitySpec(spec.vehicle!, version);
  if (gate("1.17", "passenger", spec.passenger)) {
    out.passenger = renderEntitySpec(spec.passenger!, version);
  }
  if (gate("1.16", "targetedEntity", spec.targetedEntity)) {
    out.targeted_entity = renderEntitySpec(spec.targetedEntity!, version);
  }
  return out;
}
