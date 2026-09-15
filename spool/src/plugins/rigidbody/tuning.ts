// Engine tuning knobs, baked into the commands as literals.

/** Physics constants, in blocks and ticks. Defaults are SethBling's tetherblock values. */
export interface RigidTuning {
  /** Downward acceleration, blocks/tick². */
  gravity: number;
  /** Share of velocity kept per tick. */
  damping: number;
  /** Bounciness, for impacts faster than {@link bounceBelow}. */
  restitution: number;
  /** Impacts slower than this (blocks/tick) don't bounce, so resting bodies don't jitter. */
  bounceBelow: number;
  /** Coulomb friction coefficient. */
  friction: number;
  /** Penetration left unresolved (blocks), so resting contacts stay touching. */
  slop: number;
  /** Most velocity-solver passes per tick. */
  passes: number;
  /** Below this decaying motion sum the body sleeps. */
  sleepBelow: number;
  /** Largest body edge length in blocks; bodies further apart than it allows aren't checked against each other. */
  maxSize: number;
}

export const DEFAULT_TUNING: RigidTuning = {
  gravity: 0.049,
  damping: 0.995,
  restitution: 0.6,
  bounceBelow: 0.1,
  friction: 0.8,
  slop: 0.02,
  passes: 10,
  sleepBelow: 0.0025,
  maxSize: 1,
};
