// FABRIK: bends a leg's bone chain from its hip to the solved foot.
import { math } from "helix";
import type { FunctionContext, ScoreVec3 } from "helix";
import type { LimbState } from "./state";

/** Stops a zero-length span dividing by zero. */
const EPSILON = 0.001;

/**
 * Solves leg `i` into {@link LimbState.joints}, reaching from its hip toward {@link LimbState.local}.
 * The middle joints start lifted by `knee` each poll, which is what bends the knees up.
 */
export function solve(s: LimbState, ctx: FunctionContext, i: number): void {
  const { bones, knee = 0.8, iterations = 2, mountY = 0 } = s.opts;
  const [hx, hy, hz] = s.opts.legs[i].hip;
  const { joints: j, local: foot } = s;
  const n = bones.length;
  const pinHip = () => {
    math`${s.cos} * ${hx} - ${s.sin} * ${hz}`.into(j[0].x, ctx);
    j[0].y.set(hy - mountY, ctx);
    math`${s.sin} * ${hx} + ${s.cos} * ${hz}`.into(j[0].z, ctx);
  };
  pinHip();
  for (let k = 1; k < n; k++) {
    math`${j[0]} + (${foot} - ${j[0]}) * ${k / n}`.into(j[k], ctx);
    j[k].y.add(knee, ctx);
  }
  for (let it = 0; it < iterations; it++) {
    j[n].assign(foot, ctx);
    // Stops at joint 1: the hip is pinned again straight after.
    for (let k = n - 1; k >= 1; k--) pull(s, ctx, j[k], j[k + 1], bones[k]);
    for (let k = 1; k <= n; k++) pull(s, ctx, j[k], j[k - 1], bones[k - 1]);
  }
}

/** Moves `p` onto the sphere of radius `length` around `anchor`, along the line between them. */
function pull(s: LimbState, ctx: FunctionContext, p: ScoreVec3, anchor: ScoreVec3, length: number): void {
  math`${p} - ${anchor}`.into(s.d, ctx);
  math`${anchor} + ${s.d} * ${length} / (len(${s.d}) + ${EPSILON})`.into(p, ctx);
}
