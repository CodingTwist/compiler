/**
 * The handful of numbers the runtime shot and its lead tracker both depend on: the
 * fixed-point scales the scoreboard arithmetic runs in and the objective/axis naming.
 */

/** Objective the runtime solver keeps every score on (its own, plus `.vx`/`.px`/`.ttl` per axis). */
export const OBJECTIVE = "ballistics";

/** Axis suffixes, in `Pos`/`Motion` list order. */
export const AXES = ["x", "y", "z"] as const;

/**
 * Positions are read as **centi-blocks** (`data get … 100`) and velocities held as
 * **1e-4 blocks/tick**, which is what keeps the intermediate `d·10000` inside a 32-bit
 * score for targets out to ~2000 blocks. Quantisation costs ~0.003 blocks of landing
 * error - well inside a TNT blast.
 */
export const POS_SCALE = 100;
export const V_SCALE = 10000;
