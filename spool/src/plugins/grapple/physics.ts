import { Fixed } from "helix";
import type { FunctionContext, Score, ScoreVec3 } from "helix";
import type { PlayerMotion } from "../player_motion";
import { BAUMGARTE_DIV, SUSTAIN_DIV, RADIAL_DAMP_DIV, FRAC_SCALE, POS_PER_BLOCK } from "./tuning";
import type { StateRepository } from "./state.repository";
import type { Constants } from "./constants";
import type { GrappleSelectors } from "./selectors";
import type { SwingScratch } from "./scratch";

/**
 * The **physics library**: the swing's math as pure logic over score-vectors, with no
 * knowledge of controllers, functions, or particles. It reads/writes the repository's
 * per-player state (via {@link PhysicsDeps}) and the caller's scratch, nothing else.
 *
 * Read this file top-down and it tells the story of one swing tick without any of the
 * fixed-point algebra getting in the way:
 *
 *   1. SENSE      {@link senseSwingState} - where am I, how fast, and where's the anchor?
 *   2. CONSTRAIN  {@link solveConstraint} - pull me back onto the rope + keep the swing alive.
 *   3. RELEASE    {@link releaseKick}     - fling me when I let go.
 *
 * The number-crunching lives in the small leaf helpers each step calls; the entry points
 * are meant to read like the list above.
 */
export interface PhysicsDeps {
  repo: StateRepository;
  consts: Constants;
  selectors: GrappleSelectors;
  motion: PlayerMotion;
}

/** Squared decimetres: the scale of any dot product / squared length (`scale²`). */
const SQUARED_SCALE = POS_PER_BLOCK * POS_PER_BLOCK;

// ── 1. SENSE ────────────────────────────────────────────────────────────────

/**
 * Everything the swing needs to know about *this* tick, in one place: the player's
 * position, their real velocity, the vector to the anchor, and the two radial scalars
 * the pendulum turns on (dist², dot). Also stashes the per-player state the next tick
 * and the release kick depend on. The swing service's drive tick calls just this, then
 * hands the filled-in scratch to {@link solveConstraint}.
 */
export function senseSwingState(d: PhysicsDeps, scratch: SwingScratch, ctx: FunctionContext): void {
  d.repo.readPos(ctx, d.selectors.self(), scratch.pos.components);
  measureVelocity(d, scratch);
  d.repo.velVec().assign(scratch.velocity); // stash this tick's swing velocity for the release kick
  d.repo.prevVec().assign(scratch.pos); // prev for next tick (after velocity has read the old prev)
  vectorToAnchor(d, scratch);
  measureRadial(scratch);
}

/**
 * velocity = (pos − prev): the player's actual displacement last tick, which already
 * folds in everything the engine did (real gravity, drag, walking). No feed-forward -
 * engine gravity does the falling and we simply cancel the radial share of whatever
 * velocity we measure. `pos` must already hold this tick's position and `prev` last
 * tick's. (A straight-down hang sags by ~one gravity step before the next tick catches
 * it - the accepted late-reaction trade; see `tuning.ts`.)
 */
function measureVelocity(d: PhysicsDeps, scratch: SwingScratch): void {
  scratch.velocity.assign(scratch.pos).sub(d.repo.prevVec());
}

/** r = anchor − pos (the vector from the player to the anchor). */
export function vectorToAnchor(d: Pick<PhysicsDeps, "repo">, scratch: SwingScratch): void {
  scratch.toAnchor.assign(d.repo.anchorVec()).sub(scratch.pos);
}

/**
 * The two scalars the pendulum turns on: `distSq = |r|²` (taut when ≥ ropeLen²) and
 * `dot = v · r` (sign of the radial motion). Both via integer dot products - no sqrt.
 */
function measureRadial(scratch: SwingScratch): void {
  scratch.toAnchor.lengthSquared(scratch.distSq, scratch.cross);
  scratch.velocity.dot(scratch.toAnchor, scratch.dot, scratch.cross);
}

/**
 * Fix the rope length for a fresh attach: seed `prev = pos`, compute `r = anchor −
 * pos`, and store `ropeLen² = |r|²`. Same vector maths as a drive tick, reused so
 * the radius and the per-tick distance are measured identically.
 */
export function fixRopeLength(d: Pick<PhysicsDeps, "repo">, scratch: SwingScratch): void {
  d.repo.prevVec().assign(scratch.pos);
  vectorToAnchor(d, scratch);
  scratch.toAnchor.lengthSquared(d.repo.ropeLenSqOf(), scratch.cross);
}

// ── 2. CONSTRAIN ──────────────────────────────────────────────────────────────

/**
 * The rigid-rope constraint for one taut tick, **assigned** into player_motion's launch
 * input (the swing service then clamps and sustains; engine gravity does the falling).
 * Two conceptual jobs, one per helper:
 *
 *   • {@link pullOntoRope}              - keep the player *on* the rope sphere: cancel the
 *                                        radial velocity + a capped position trim.
 *   • {@link sustainTangentialMomentum} - keep the swing *alive*: re-add the tangential
 *                                        speed engine drag would otherwise bleed away.
 *
 * Runs only when taut; on a slack tick the swing service leaves the launch vector zeroed
 * so only gravity applies. Everything is integer dot products - no sqrt anywhere.
 */
export function solveConstraint(d: PhysicsDeps, scratch: SwingScratch): void {
  pullOntoRope(d, scratch);
  if (SUSTAIN_DIV > 0 || RADIAL_DAMP_DIV > 0) sustainTangentialMomentum(d, scratch);
}

/**
 * Project a squared-scale scalar back onto the rope: `out = (numerator / |r|²) · r`. This one
 * operation is the heart of both constraint steps - the rope correction projects `coef`, the
 * velocity split projects `dot` - so it's named once here. `gain = numerator · FRAC_SCALE /
 * dist²` is carried in the `gainSlot` at FRAC_SCALE; the divide is the precision-critical step -
 * `Fixed.divide` applies the scale *before* the integer `/=`, so it can't truncate to zero (the
 * free-fall bug). Then `out = gain · r`.
 */
function projectOntoRope(
  d: PhysicsDeps,
  scratch: SwingScratch,
  numerator: Score,
  gainSlot: Score,
  out: ScoreVec3,
): void {
  const gain = new Fixed(gainSlot, FRAC_SCALE, d.consts.fracScale);
  gain.assign(numerator).divide(scratch.distSq); // gain = numerator · FRAC_SCALE / dist²
  out.assign(scratch.toAnchor).scale(gainSlot); //  out  = gain · r
}

/**
 * The rope correction proper: cancel the *full* radial velocity (a rope is inextensible -
 * radial velocity ~0 in *both* directions, which critically damps the swing instead of
 * letting the position trim bungee it) plus a Baumgarte position trim back onto the sphere,
 * **capped at baumMax** so a deep overshoot can't fling the player off the rope (the
 * residual-bounce killer; see BAUMGARTE_MAX). Writes the result straight into launchInput.
 *
 *   coef    = −dot + min((dist² − ropeLen²)/BAUMGARTE_DIV, baumMax)
 *   impulse = (coef / |r|²) · r          (via {@link projectOntoRope})
 *
 * Both terms divide by dist² but their numerators scale *with* dist (dot ∝ dist, the
 * overshoot is a length), so the impulse stays bounded by radial speed / overshoot - never
 * the old 1/dist² blow-up. We deliberately do *not* floor `coef` at 0: see the bungee note
 * in `README.md`.
 */
function pullOntoRope(d: PhysicsDeps, scratch: SwingScratch): void {
  const consts = d.consts;

  // `coef`/`baum` are squared quantities (dot, dist²), so scale = POS_PER_BLOCK². `negate`/
  // `reduce` make the −1 and the unitless Baumgarte divisor read as intent. The final
  // divide-by-dist² and projection onto the rope is `projectOntoRope`.
  const coef = new Fixed(scratch.coef, SQUARED_SCALE);
  const baum = new Fixed(scratch.baum, SQUARED_SCALE);

  // coef = −dot [+ (dist² − ropeLen²)/BAUMGARTE_DIV]. The velocity-cancel (−dot) is the
  // stable, critically-damping part; the Baumgarte trim is the optional anti-droop nudge
  // (a proven bounce source if too stiff - see tuning.ts), skipped entirely when disabled.
  coef.assign(scratch.dot).negate(consts.negOne);
  if (BAUMGARTE_DIV > 0) {
    // baum = (dist² − ropeLen²)/BAUMGARTE_DIV, then **capped** at baumMax. The clamp is the
    // bounce killer: an uncapped trim, proportional to overshoot, accelerated the player off
    // the rope into slack at a deep late catch (see BAUMGARTE_MAX). Capped, a deep overshoot
    // recovers gently while the `−dot` cancel still holds the rope; a small drift overshoot is
    // under the cap and corrected at full strength. No floor needed: overshoot ≥ 0 while taut.
    baum.assign(scratch.distSq).sub(d.repo.ropeLenSqOf()).reduce(consts.baumDiv);
    baum.score.min(consts.baumMax);
    coef.add(baum);
  }

  // impulse = (coef / |r|²) · r - the coefficient projected onto the rope, straight into
  // launchInput (swing clamps + sustains).
  projectOntoRope(d, scratch, scratch.coef, scratch.frac, d.repo.launchVec());
}

/**
 * Anti-limp: re-add the slice of *tangential* velocity the engine's ~9 %/tick drag bleeds,
 * so the swing holds speed and can be pumped (strafe to build amplitude). The impulse model
 * can only *add* to velocity (Minecraft has no set-velocity), so without this a raw pendulum
 * goes limp in a second. Adds to the launch impulse {@link pullOntoRope} already wrote.
 *
 *   radVec  = (dot·FRAC_SCALE/dist²)·r        (the radial slice of velocity, as a vector)
 *   tangVec = v·FRAC_SCALE − radVec           (radial projected out → tangential only)
 *   impulse += tangVec / SUSTAIN_DIV           (re-add the drag-bled tangential fraction)
 *
 * Tangential *only* - the radial (bounce) axis is projected out, so this can never re-feed the
 * vertical bounce. SUSTAIN_DIV is the #1 feel knob and has a hard floor: below the drag
 * break-even the swing gains energy and spins forever (see tuning.ts).
 *
 * A radial-**overdamp** term (subtract an extra radVec/RADIAL_DAMP_DIV) is wired here but off by
 * default - it's a rebound generator, not a damper; see RADIAL_DAMP_DIV.
 */
function sustainTangentialMomentum(d: PhysicsDeps, scratch: SwingScratch): void {
  const consts = d.consts;
  const impulse = d.repo.launchVec();

  // radVec = (dot / |r|²) · r - the radial slice of velocity as a vector: the same projection
  // onto the rope as the correction, with `dot` (radial speed) as the numerator.
  projectOntoRope(d, scratch, scratch.dot, scratch.fracRad, scratch.radVec);

  if (SUSTAIN_DIV > 0) {
    // tangVec = v·FRAC_SCALE − radVec (radial removed), then re-add a SUSTAIN_DIV slice of it.
    scratch.tangVec.assign(scratch.velocity).scale(consts.fracScale).sub(scratch.radVec);
    scratch.tangVec.divide(consts.sustainDiv);
    impulse.add(scratch.tangVec);
  }
  if (RADIAL_DAMP_DIV > 0) {
    // radVec still holds the full radial velocity (the sustain only read it); scale it down and
    // subtract for the extra damping. Off by default - it adds restitution, not damping.
    scratch.radVec.divide(consts.radialDampDiv);
    impulse.sub(scratch.radVec);
  }
}

// ── 3. RELEASE ────────────────────────────────────────────────────────────────

/**
 * The **on-release fling**: called from the release service, this adds a single impulse
 * *along the player's line of sight* (player_motion's local `forward` axis) so letting go of
 * the rope launches you where you're looking instead of stalling against Minecraft's fast air
 * drag (see {@link RELEASE_KICK}). Momentum is kept both ways: the launch **adds** to velocity
 * so your existing swing carries through, and the kick's magnitude scales with how hard you
 * were swinging.
 *
 * The swing speed comes from the per-player velocity drive **stored** last tick (`velVec`),
 * *not* a fresh `pos − prev`: drive overwrites `prev` with the current position every tick, so
 * if `stop` runs the same tick after drive (the common case) a fresh `pos − prev` reads **zero**
 * and the kick vanishes. Reading the stashed velocity gives the real last swing velocity every
 * time. From it we take **speed² = v·v** (`lengthSquared`; sqrt-free, same integer dot product the
 * solver uses); the forward launch is `speed² · RELEASE_KICK`, capped at `RELEASE_KICK_MAX`. Only
 * the local `forward` axis (`launchInput.z`) is driven; sideways (`.x`) and up (`.y`) are zeroed,
 * so the fling follows the full look direction (pitch included). `applyLocal` sustains it one-shot.
 *
 * **Must run at the player** (`execute at @s`): the local-frame launch needs the player's
 * position/rotation context, which the release service's callers don't all provide.
 */
export function releaseKick(d: PhysicsDeps, scratch: SwingScratch, ctx: FunctionContext): void {
  const consts = d.consts;

  // speed² = v·v (dm²) of the swing velocity drive stored last tick, into the spare `frac`
  // scalar (cross is its dot-product scratch). Not a fresh pos−prev (see docstring: races drive).
  d.repo.velVec().lengthSquared(scratch.frac, scratch.cross);

  // Local launch: forward (line of sight) = speed² · RELEASE_KICK, capped; no sideways / up.
  const launch = d.repo.launchVec();
  ctx.scoreSet(launch.x.set(0));
  ctx.scoreSet(launch.y.set(0));
  launch.z.assign(scratch.frac).times(consts.releaseKick).min(consts.releaseKickMax);
  d.motion.applyLocal(ctx);
}
