// Per-tick scratch scores, and the slots one swing tick uses.
import { Objective, ScoreTarget, ScoreVec3 } from "helix";

/** A bound scoreboard slot - what `Objective.score(...)` yields. */
type Score = ReturnType<Objective["score"]>;

/** Per-tick scratch scores on `grapple.work`; nothing here survives between ticks. */
export function createScratch() {
  const work = new Objective("grapple.work");
  const scalar = (name: string): Score => work.score(ScoreTarget(`#${name}`));
  const vector = (prefix: string): ScoreVec3 =>
    ScoreVec3.from((axis) => scalar(`${prefix}_${axis}`));
  return { work, scalar, vector };
}

/** The per-tick working-memory allocator - whatever {@link createScratch} returns. */
export type Scratch = ReturnType<typeof createScratch>;

/**
 * Every scratch slot one swing tick uses:
 *   pos      #pos_*       player position (decimetres)
 *   velocity #vel_*       pos − prev
 *   toAnchor #to_anchor_* r = anchor − pos
 *   radVec   #rad_*       radial part of velocity
 *   distSq   #dist_sq     |r|²
 *   dot      #dot         v · r
 *   coef/frac/fracRad     constraint intermediates
 */
export function swingScratch(scratch: Scratch) {
  return {
    pos: scratch.vector("pos"),
    velocity: scratch.vector("vel"),
    toAnchor: scratch.vector("to_anchor"),
    radVec: scratch.vector("rad"),
    distSq: scratch.scalar("dist_sq"),
    dot: scratch.scalar("dot"),
    coef: scratch.scalar("coef"),
    frac: scratch.scalar("frac"),
    fracRad: scratch.scalar("frac_rad"),
  };
}
export type SwingScratch = ReturnType<typeof swingScratch>;
