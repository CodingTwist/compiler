// Engine tuning knobs, baked into the commands as literals.

/** Physics constants. Defaults are SethBling's tetherblock values. */
export interface RigidTuning {
  /** Downward acceleration, mm/tick². */
  gravity: number;
  /** Velocity kept per tick, ×1000. */
  damping: number;
  /** Bounciness ×1000, for impacts faster than {@link bounceBelow}. */
  restitution: number;
  /** Impacts slower than this (mm/tick) don't bounce, so resting bodies don't jitter. */
  bounceBelow: number;
  /** Coulomb friction coefficient ×1000. */
  friction: number;
  /** Penetration left unresolved (mm), so resting contacts stay touching. */
  slop: number;
  /** Most velocity-solver passes per tick. */
  passes: number;
  /** Below this decaying motion sum the body sleeps. */
  sleepBelow: number;
  /** Largest body edge length in blocks; bodies further apart than it allows aren't checked against each other. */
  maxSize: number;
}

export const DEFAULT_TUNING: RigidTuning = {
  gravity: 49,
  damping: 995,
  restitution: 600,
  bounceBelow: 100,
  friction: 800,
  slop: 20,
  passes: 10,
  sleepBelow: 2500,
  maxSize: 1,
};
