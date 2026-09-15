// CONSTRAIN: keeps the player on the rope and the swing going.
import { math } from "helix";
import type { Score, ScoreVec3 } from "helix";
import { BAUMGARTE_DIV, SUSTAIN_DIV, RADIAL_DAMP_DIV } from "../tuning";
import type { SwingScratch } from "../state";
import type { PhysicsDeps } from "./types";

/**
 * The rope constraint for one taut tick, written into player_motion's launch input.
 *
 * - {@link pullOntoRope}: keep the player on the rope.
 * - {@link sustainTangentialMomentum}: replace the swing speed drag removes.
 */
export function solveConstraint(d: PhysicsDeps, scratch: SwingScratch): void {
  pullOntoRope(d, scratch);
  if (SUSTAIN_DIV > 0 || RADIAL_DAMP_DIV > 0)
    sustainTangentialMomentum(d, scratch);
}

/**
 * Projects a scalar onto the rope: `out = (numerator / |r|²) · r`.
 *
 * Multiplies by FRAC_SCALE before dividing; dividing first floors to zero and the player
 * free-falls.
 */
function projectOntoRope(
  d: PhysicsDeps,
  scratch: SwingScratch,
  numerator: Score,
  gainSlot: Score,
  out: ScoreVec3,
): void {
  math`${numerator} * ${d.consts.fracScale} / ${scratch.distSq}`.into(gainSlot);
  math`${scratch.toAnchor} * ${gainSlot}`.into(out); // out = gain · r (broadcast per axis)
}

/**
 * Cancels all radial velocity and adds a capped position trim back onto the rope.
 *
 *   coef    = −dot + min((dist² − ropeLen²)/BAUMGARTE_DIV, baumMax)
 *   impulse = (coef / |r|²) · r          (via {@link projectOntoRope})
 *
 * Don't floor `coef` at 0; see the bungee note in `README.md`.
 */
function pullOntoRope(d: PhysicsDeps, scratch: SwingScratch): void {
  const consts = d.consts;

  // Uncapped, the trim flung players off the rope after a deep catch; see BAUMGARTE_MAX.
  // No floor needed: overshoot is ≥ 0 while taut.
  if (BAUMGARTE_DIV > 0)
    math`-${scratch.dot} + min((${scratch.distSq} - ${d.repo.ropeLenSqOf()}) / ${consts.baumDiv}, ${consts.baumMax})`.into(
      scratch.coef,
    );
  else math`-${scratch.dot}`.into(scratch.coef);

  // impulse = (coef / |r|²) · r, written straight into launchInput.
  projectOntoRope(d, scratch, scratch.coef, scratch.frac, d.repo.launchVec());
}

/**
 * Adds back the tangential speed engine drag removes, so the swing doesn't go limp.
 *
 *   radVec  = (dot·FRAC_SCALE/dist²)·r
 *   tangVec = v·FRAC_SCALE − radVec
 *   impulse += tangVec / SUSTAIN_DIV
 *
 * Tangential only, so it can't feed the bounce. SUSTAIN_DIV has a hard floor; see
 * `tuning.ts`.
 */
function sustainTangentialMomentum(
  d: PhysicsDeps,
  scratch: SwingScratch,
): void {
  const consts = d.consts;
  const impulse = d.repo.launchVec();

  // radVec = (dot / |r|²) · r: the radial part of velocity.
  projectOntoRope(d, scratch, scratch.dot, scratch.fracRad, scratch.radVec);

  if (SUSTAIN_DIV > 0) {
    // impulse += (v·FRAC_SCALE − radVec) / SUSTAIN_DIV
    math`${impulse} + (${scratch.velocity} * ${consts.fracScale} - ${scratch.radVec}) / ${consts.sustainDiv}`.into(
      impulse,
    );
  }
  if (RADIAL_DAMP_DIV > 0) {
    // Extra radial damping. Off by default: it adds bounce instead of removing it.
    math`${impulse} - ${scratch.radVec} / ${consts.radialDampDiv}`.into(
      impulse,
    );
  }
}
