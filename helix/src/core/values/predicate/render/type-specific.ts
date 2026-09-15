import type { VersionProfile } from "../../../../versions/profile";
import type { PredicateJson, TypeSpecificSpec } from "../types";
import { ENTITY_TYPE_KEY_DATA_VERSION } from "../versions";
import { atLeast, fields, since, type Since } from "./common";
import { renderPlayer, type RenderEntity } from "./player";

/** When each type became checkable (vanilla-mcdoc `SpecificType`). */
const FROM: Record<TypeSpecificSpec["type"], Since> = {
  player: "1.19",
  fishing_hook: "1.19",
  lightning: "1.19",
  slime: "1.19",
  cat: "1.19",
  frog: "1.19",
  // ponytail: really 1.19.3, which has no DV key; nobody targets 1.19.3-4.
  axolotl: "1.20",
  boat: "1.20",
  fox: "1.20",
  horse: "1.20",
  llama: "1.20",
  mooshroom: "1.20",
  painting: "1.20",
  parrot: "1.20",
  rabbit: "1.20",
  tropical_fish: "1.20",
  villager: "1.20",
  raider: "1.20.5",
  sheep: "1.20.5",
  salmon: "1.20.5",
  wolf: "1.20.5",
};

/** The variant checks vanilla removed, in favour of entity components. */
const REMOVED: Partial<Record<TypeSpecificSpec["type"], Since>> = {
  boat: "1.21.2",
  axolotl: "1.21.5",
  cat: "1.21.5",
  fox: "1.21.5",
  frog: "1.21.5",
  horse: "1.21.5",
  llama: "1.21.5",
  mooshroom: "1.21.5",
  painting: "1.21.5",
  parrot: "1.21.5",
  rabbit: "1.21.5",
  salmon: "1.21.5",
  tropical_fish: "1.21.5",
  villager: "1.21.5",
  wolf: "1.21.5",
};

function body(
  spec: TypeSpecificSpec,
  version: VersionProfile,
  entity: RenderEntity,
): PredicateJson {
  switch (spec.type) {
    case "player":
      return renderPlayer(spec, version, entity);
    case "fishing_hook":
      return fields(spec, ["inOpenWater"]);
    case "lightning": {
      const out = fields(spec, ["blocksSetOnFire"]);
      if (spec.entityStruck) out.entity_struck = entity(spec.entityStruck, version);
      return out;
    }
    case "raider":
      return fields(spec, ["hasRaid", "isCaptain"]);
    case "sheep":
      if (spec.color !== undefined) {
        if (atLeast(version, "1.21.5")) {
          throw new Error(`Predicate sheep color was removed in 1.21.5; the pack targets ${version.id}`);
        }
        return { ...fields(spec, ["sheared"]), color: spec.color };
      }
      return fields(spec, ["sheared"]);
    case "slime":
      return fields(spec, ["size"]);
    default: {
      const v = spec.variant;
      const render = (x: string | { render(): string }) =>
        typeof x === "string" ? x : x.render();
      return { variant: Array.isArray(v) ? v.map(render) : render(v) };
    }
  }
}

/** A type-specific check as its key and value: `type_specific` before 26.2, `type_specific/<x>` since. */
export function renderTypeSpecific(
  spec: TypeSpecificSpec,
  version: VersionProfile,
  entity: RenderEntity,
): [string, PredicateJson] {
  since(version, FROM[spec.type], `typeSpecific ${spec.type}`);
  const removed = REMOVED[spec.type];
  if (removed && atLeast(version, removed)) {
    throw new Error(
      `Predicate typeSpecific ${spec.type} was removed in ${removed}; match its variant component instead (the pack targets ${version.id})`,
    );
  }
  const json = body(spec, version, entity);
  if (version.dataVersion >= ENTITY_TYPE_KEY_DATA_VERSION) {
    const name = spec.type === "slime" ? "cube_mob" : spec.type;
    return [`type_specific/${name}`, json];
  }
  const type = atLeast(version, "1.20.5") ? `minecraft:${spec.type}` : spec.type;
  return ["type_specific", { type, ...json }];
}
