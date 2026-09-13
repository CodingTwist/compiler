import { EntityType, Id } from "helix";

// ── Tuning knobs ────────────────────────────────────────────────────────────
// Every grapple number in one file for playtesting. The maths is in `physics.ts`.

/**
 * Fixed-point scale: 10 units per block (decimetres).
 *
 * The rope is a pendulum: engine gravity does the falling, and each taut tick cancels all
 * radial
 * velocity. Don't simulate gravity in the solver instead; that was tried and felt sluggish.
 *
 * Decimetres because the cancel divides by dist² in integers: centimetres truncate to 0 on
 * long
 * ropes (free fall), and finer scales overflow int32 on fast swings.
 */
export const POS_PER_BLOCK = 10;
/** Default raycast steps (0.5 blocks each) when `maxReach` is unset - 50 blocks. */
export const MAX_STEPS = 100;
/**
 * Per-axis cap on the rope impulse (10000 = 1 block/tick). Limits the first yank after
 * firing
 * while moving fast. Raise for snappier, lower for softer.
 */
export const MAX_IMPULSE = 8000;

/* ── Feel knobs (tweak these, rebuild, playtest) ──────────────────────────── */
/**
 * Position-trim softness: overshoot is divided by this. Higher is softer, `0` disables it.
 *
 * `8` was too stiff and caused a growing bounce.
 */
export const BAUMGARTE_DIV = 32;
/**
 * Cap on the position trim. Without it, a deep overshoot flings the player back off the
 * rope
 * into an endless bounce.
 *
 * Lower is floppier, higher is firmer. Only used while `BAUMGARTE_DIV > 0`.
 */
export const BAUMGARTE_MAX = 80;
/**
 * Tangential sustain, the main feel knob: re-adds `v_tang / SUSTAIN_DIV` each taut tick to
 * offset drag.
 *
 * Lower is livelier, higher is limper, `0` disables it. At 14 or below the swing gains
 * energy
 * and spins forever, so don't lower it for bigger swings.
 */
export const SUSTAIN_DIV = 18;
/** Extra radial damping. Keep at `0`: it adds bounce instead of removing it. */
export const RADIAL_DAMP_DIV = 0;
/** Fixed-point multiplier that preserves precision across the integer `/dist²` divide (see POS_PER_BLOCK). */
export const FRAC_SCALE = 1000;

/**
 * Release fling strength, scaled by swing speed² (no sqrt in commands).
 *
 * Launch units per dm² of speed²: at `90`, a 1 block/tick swing flings at ~0.9 block/tick.
 * Lower is gentler, `0` disables. Capped by {@link RELEASE_KICK_MAX}.
 */
export const RELEASE_KICK = 90;
/** Max release fling, in launch units (10000 = 1 block/tick). */
export const RELEASE_KICK_MAX = 16000;

/**
 * The anchor: a `marker` entity at the hit point. `grapple/stop` kills it.
 *
 * Not a leashed mob: leashes set on a live entity don't render, and they break past ~10
 * blocks.
 */
export const ANCHOR_TYPE = EntityType("marker");

/**
 * In-game diagnostics: anchor/miss messages on start and an action-bar readout while
 * swinging.
 */
export const DEBUG = false;

/**
 * Removes gravity while grappling, so hangs are dead still.
 *
 * Changes the feel: swings become momentum orbits instead of pendulums. Done with a
 * removable
 * attribute modifier ({@link GRAVITY_MODIFIER_ID}), so the player's gravity is restored
 * exactly.
 */
export const ZERO_GRAVITY = false;
/** The stable id the zero-gravity attach modifier is keyed by; `grapple/stop` removes it. */
export const GRAVITY_MODIFIER_ID = Id("grapple:zero_gravity");

/** Logs full swing state to chat every tick (lands in `logs/latest.log`). Very noisy. */
export const LOG = false;
