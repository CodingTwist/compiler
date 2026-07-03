import { Objective, ScoreTarget, ScoreVec3 } from "helix";

/** A bound scoreboard slot - what `Objective.score(...)` yields. */
type Score = ReturnType<Objective["score"]>;

/**
 * The per-tick **working memory**: the `grapple.work` objective plus the two factories
 * that carve transient `#name` slots out of it - `scalar("dist_sq")` for one score,
 * `vector("vel")` for a `#vel_x/#vel_y/#vel_z` {@link ScoreVec3}. These are scribble
 * space the swing math overwrites every tick; nothing here survives between ticks (that's
 * the repository). Kept separate so "scratch" and "persistent state" never blur together.
 */
export function createScratch() {
  const work = new Objective("grapple.work");
  const scalar = (name: string): Score => work.score(ScoreTarget(`#${name}`));
  const vector = (prefix: string): ScoreVec3 =>
    new ScoreVec3(scalar(`${prefix}_x`), scalar(`${prefix}_y`), scalar(`${prefix}_z`));
  return { work, scalar, vector };
}

/** The per-tick working-memory allocator - whatever {@link createScratch} returns. */
export type Scratch = ReturnType<typeof createScratch>;

/**
 * All the scratch slots one swing tick's math uses, allocated once. Named here so every
 * physics helper agrees on the slots:
 *   pos      #pos_*       the player's position this tick (decimetres)
 *   velocity #vel_*       pos − prev (the player's real displacement last tick)
 *   toAnchor #to_anchor_* r = anchor − pos
 *   radVec   #rad_*       the radial slice of velocity, as a vector
 *   tangVec  #tang_*      the tangential slice of velocity, as a vector
 *   distSq   #dist_sq     |r|²
 *   dot      #dot         v · r
 *   cross    #cross       cross-term temp for the dot products
 *   coef/baum/frac/fracRad the constraint's intermediate scalars
 */
export function swingScratch(scratch: Scratch) {
  return {
    pos: scratch.vector("pos"),
    velocity: scratch.vector("vel"),
    toAnchor: scratch.vector("to_anchor"),
    radVec: scratch.vector("rad"),
    tangVec: scratch.vector("tang"),
    distSq: scratch.scalar("dist_sq"),
    dot: scratch.scalar("dot"),
    cross: scratch.scalar("cross"),
    coef: scratch.scalar("coef"),
    baum: scratch.scalar("baum"),
    frac: scratch.scalar("frac"),
    fracRad: scratch.scalar("frac_rad"),
  };
}
export type SwingScratch = ReturnType<typeof swingScratch>;
