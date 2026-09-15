import type { VersionProfile } from "../../../../versions/profile";
import { Block } from "../../block";
import type { FluidSpec, IdList, LocationSpec, PredicateJson } from "../types";
import { atLeast, bound, idList, idStr, since } from "./common";

/** A pre-1.20.5 single-id field, where tags and lists throw. */
function legacyId(x: IdList, version: VersionProfile, what: string): string {
  if (Array.isArray(x)) return idList(x, version, what) as string;
  const id = idStr(x);
  if (id.startsWith("#")) since(version, "1.20.5", `${what} tag`);
  return id;
}

function renderFluid(spec: FluidSpec, version: VersionProfile): PredicateJson {
  const out: PredicateJson = {};
  if (spec.fluids !== undefined) {
    if (atLeast(version, "1.20.5")) {
      out.fluids = idList(spec.fluids, version, "fluid");
    } else {
      // Before 1.20.5 a fluid tag had its own field.
      const id = idList(spec.fluids, version, "fluid") as string;
      if (id.startsWith("#")) out.tag = id.slice(1);
      else out.fluid = id;
    }
  }
  if (spec.state) {
    out.state = Object.fromEntries(
      Object.entries(spec.state).map(([k, v]) => [
        k,
        typeof v === "object" ? bound(v) : v,
      ]),
    );
  }
  return out;
}

export function renderLocation(
  spec: LocationSpec,
  version: VersionProfile,
): PredicateJson {
  const out: PredicateJson = {};
  const modern = atLeast(version, "1.20.5");
  if (spec.biome !== undefined) {
    if (modern) out.biomes = idList(spec.biome, version, "biome");
    else out.biome = legacyId(spec.biome, version, "biome");
  }
  if (spec.structure !== undefined) {
    if (modern) out.structures = idList(spec.structure, version, "structure");
    else {
      const key = atLeast(version, "1.19") ? "structure" : "feature";
      out[key] = legacyId(spec.structure, version, "structure");
    }
  }
  if (spec.dimension !== undefined) out.dimension = idStr(spec.dimension);
  if (spec.block !== undefined) {
    const block = typeof spec.block === "string" ? Block(spec.block) : spec.block;
    out.block = block.toPredicate(version);
  }
  if (spec.fluid) out.fluid = renderFluid(spec.fluid, version);
  if (spec.light !== undefined) out.light = { light: bound(spec.light) };
  if (spec.smokey !== undefined) {
    since(version, "1.16", "smokey");
    out.smokey = spec.smokey;
  }
  if (spec.canSeeSky !== undefined) {
    since(version, "1.21", "canSeeSky");
    out.can_see_sky = spec.canSeeSky;
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
