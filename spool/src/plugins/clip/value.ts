/**
 * Interpolation primitives + the keyframe model the timeline engine samples.
 *
 * The number-crunching math (interpolation, quaternions, rotate-about-pivot,
 * stable rounding) all lives in the compiler core (`lerp`/`lerpVec3`, `quat`,
 * `rotateAboutPivot`, `round6`) - this module only adds the keyframe *sampler*
 * the baked tracks use, composing the core `lerp`/`lerpVec3` mixers. No math is
 * redone here: `lerp` is imported and re-exported so callers have one home.
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
 * Sample a sorted keyframe list at `tick`, returning the interpolated value via
 * `mix`. Clamps outside the range (holds the first/last value), and respects a
 * `"step"` ease (hold the left keyframe until the next one).
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

/**
 * Build a nested object from a dotted NBT path and a leaf value, e.g.
 * `nest("transformation.translation", v)` -> `{transformation:{translation:v}}`.
 * Used by the generic NBT track to merge an arbitrary path.
 */
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
