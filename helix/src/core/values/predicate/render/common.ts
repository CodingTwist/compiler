import type { VersionProfile } from "../../../../versions/profile";
import { DV } from "../../entity-versions.generated";
import { Id } from "../../id";
import { CONDITION_TYPE_DATA_VERSION } from "../versions";
import type { Bound, IdList, PredicateJson } from "../types";

/** A version key from vanilla-mcdoc's `#[since]` tags. */
export type Since = keyof typeof DV;

/** Throws when the pack targets a version before `since`, naming the field. */
export function since(version: VersionProfile, from: Since, what: string): void {
  if (version.dataVersion < DV[from]) {
    throw new Error(
      `Predicate ${what} needs ${from}+, but the pack targets ${version.id}`,
    );
  }
}

/** True when the pack targets `from` or later. */
export const atLeast = (version: VersionProfile, from: Since): boolean =>
  version.dataVersion >= DV[from];

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

/** An id, tag or list as JSON. A list throws before 1.20.5. */
export function idList(
  x: IdList,
  version: VersionProfile,
  what: string,
): string | string[] {
  if (Array.isArray(x)) {
    since(version, "1.20.5", `${what} list`);
    return x.map(idStr);
  }
  return idStr(x);
}

export function bound(b: Bound): unknown {
  return typeof b === "number" ? b : { min: b.min, max: b.max };
}

/** Copies the set `keys` of `spec` (bounds or booleans) under their snake_case names. */
export function fields<T extends object>(spec: T, keys: (keyof T)[]): PredicateJson {
  const out: PredicateJson = {};
  for (const k of keys) {
    const v = spec[k] as Bound | boolean | undefined;
    if (v === undefined) continue;
    out[snake(k as string)] = typeof v === "boolean" ? v : bound(v);
  }
  return out;
}

/** `horizontalSpeed` to `horizontal_speed`. */
export const snake = (s: string): string =>
  s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
