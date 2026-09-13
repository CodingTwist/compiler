/**
 * Keyframe sampling for the timeline engine. The maths itself (`lerp`, `quat`...) lives in
 * helix.
 */
import { lerp, lerpVec3 } from "helix";
import type { Vec3, NbtInput } from "helix";

export { lerp, lerpVec3 } from "helix";

/** How a keyframe segment is traversed up to the *next* keyframe. */
export type Ease = "linear" | "step";

/** One point on a track's timeline: a value pinned at a tick. */
export interface Keyframe<T> {
  /** Absolute tick within the clip. */
  tick: number;
  /** The value held at `tick`. */
  value: T;
  /** Interpolation toward the next keyframe (default `"linear"`). */
  ease?: Ease;
}

/**
 * Samples sorted keyframes at `tick` with `mix`. Holds the ends, and `"step"` holds the
 * left key.
 */
export function sample<T>(
  keys: readonly Keyframe<T>[],
  tick: number,
  mix: (a: T, b: T, u: number) => T,
): T {
  if (keys.length === 0) throw new Error("sample(): no keyframes.");
  if (tick <= keys[0].tick) return keys[0].value;
  const last = keys[keys.length - 1];
  if (tick >= last.tick) return last.value;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (tick >= a.tick && tick <= b.tick) {
      if (a.ease === "step") return a.value;
      const span = b.tick - a.tick;
      const u = span === 0 ? 0 : (tick - a.tick) / span;
      return mix(a.value, b.value, u);
    }
  }
  return last.value;
}

/** Sample a scalar keyframe track. */
export const sampleScalar = (keys: readonly Keyframe<number>[], tick: number): number =>
  sample(keys, tick, lerp);

/** Sample a 3-vector keyframe track. */
export const sampleVec3 = (keys: readonly Keyframe<Vec3>[], tick: number): Vec3 =>
  sample(keys, tick, lerpVec3);

/** Builds a nested object from a dotted path, e.g. `nest("a.b", v)` -> `{a:{b:v}}`. */
export function nest(path: string, value: NbtInput): { [key: string]: NbtInput } {
  const parts = path.split(".");
  const root: { [key: string]: NbtInput } = {};
  let cur = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const next: { [key: string]: NbtInput } = {};
    cur[parts[i]] = next;
    cur = next;
  }
  cur[parts[parts.length - 1]] = value;
  return root;
}
