import type { VersionProfile } from "../../../../versions/profile";
import type { EntityPredicateSpec, PlayerSpec, PredicateJson } from "../types";
import { atLeast, bound, fields, idStr, since } from "./common";

export type RenderEntity = (spec: EntityPredicateSpec, version: VersionProfile) => PredicateJson;

/** Namespaces the keys of an id-keyed map. */
const byId = <V>(m: Record<string, V>) =>
  Object.fromEntries(Object.entries(m).map(([id, v]) => [idStr(id), v]));

/** The body of a `player` type-specific check. */
export function renderPlayer(
  p: PlayerSpec,
  version: VersionProfile,
  entity: RenderEntity,
): PredicateJson {
  const out = fields(p, ["level"]);
  if (p.gamemode !== undefined) {
    const modes = Array.isArray(p.gamemode) ? p.gamemode : [p.gamemode];
    if (atLeast(version, "1.21")) out.gamemode = modes;
    else if (modes.length === 1) out.gamemode = modes[0];
    else since(version, "1.21", "gamemode list");
  }
  if (p.advancements) out.advancements = byId(p.advancements);
  if (p.recipes) out.recipes = byId(p.recipes);
  if (p.stats) {
    out.stats = p.stats.map((s) => ({
      type: idStr(s.type),
      stat: idStr(s.stat),
      value: bound(s.value),
    }));
  }
  if (p.lookingAt) out.looking_at = entity(p.lookingAt, version);
  if (p.input) {
    since(version, "1.21.2", "input");
    out.input = { ...p.input };
  }
  if (p.food) {
    since(version, "26.1", "food");
    out.food = fields(p.food, ["level", "saturation"]);
  }
  return out;
}
