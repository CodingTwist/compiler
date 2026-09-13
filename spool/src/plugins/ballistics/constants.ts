/** Fixed-point scales and naming shared by the runtime shot and its lead tracker. */

/** Objective the runtime solver keeps every score on (its own, plus `.vx`/`.px`/`.ttl` per axis). */
export const OBJECTIVE = "ballistics";

/** Axis suffixes, in `Pos`/`Motion` list order. */
export const AXES = ["x", "y", "z"] as const;

/**
 * Positions in centi-blocks, velocities in 1e-4 blocks/tick.
 *
 * Keeps the maths inside 32-bit scores out to ~2000 blocks, for ~0.003 blocks of error.
 */
export const POS_SCALE = 100;
export const V_SCALE = 10000;
