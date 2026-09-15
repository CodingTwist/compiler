// SENSE: measures position, velocity and the vector to the anchor.
import type { FunctionContext } from "helix";
import type { SwingScratch } from "../state";
import type { PhysicsDeps } from "./types";

/**
 * Measures this tick's swing state (position, velocity, vector to anchor, dist², dot)
 * and stores what the next tick and release need.
 */
export function senseSwingState(
  d: PhysicsDeps,
  scratch: SwingScratch,
  ctx: FunctionContext,
): void {
  d.repo.readPos(ctx, d.selectors.self(), scratch.pos);
  measureVelocity(d, scratch);
  d.repo.velVec().assign(scratch.velocity); // stash this tick's swing velocity for the release kick
  d.repo.prevVec().assign(scratch.pos); // prev for next tick (after velocity has read the old prev)
  vectorToAnchor(d, scratch);
  measureRadial(scratch);
}

/**
 * velocity = pos − prev: the actual movement last tick, including engine gravity and drag.
 * `pos` must hold this tick's position and `prev` last tick's.
 */
function measureVelocity(d: PhysicsDeps, scratch: SwingScratch): void {
  scratch.velocity.assign(scratch.pos).sub(d.repo.prevVec());
}

/** r = anchor − pos (the vector from the player to the anchor). */
export function vectorToAnchor(
  d: Pick<PhysicsDeps, "repo">,
  scratch: SwingScratch,
): void {
  scratch.toAnchor.assign(d.repo.anchorVec()).sub(scratch.pos);
}

/** `distSq = |r|²` (taut when ≥ ropeLen²) and `dot = v · r` (radial direction). No sqrt. */
function measureRadial(scratch: SwingScratch): void {
  scratch.toAnchor.lengthSquared(scratch.distSq);
  scratch.velocity.dot(scratch.toAnchor, scratch.dot);
}

/**
 * Sets the rope length on attach, using the same maths as a drive tick so they measure
 * alike.
 */
export function fixRopeLength(
  d: Pick<PhysicsDeps, "repo">,
  scratch: SwingScratch,
): void {
  d.repo.prevVec().assign(scratch.pos);
  vectorToAnchor(d, scratch);
  scratch.toAnchor.lengthSquared(d.repo.ropeLenSqOf());
}
