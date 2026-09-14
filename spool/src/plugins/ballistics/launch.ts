// The options and result of `solveLaunch`.
import type { Vec3 } from "helix";
import type { ProjectileProfile } from "./projectiles";

/**
 * Options for finding a launch that hits a target.
 *
 * Flight time is the only free choice: for each time, the velocity that hits exactly is one
 * division (see `physics.ts`). So the solver lists exact solutions and filters them by your
 * constraints, rather than searching.
 *
 * Whole ticks by default, so TNT with `fuse = ticks` explodes right on target.
 *
 * Known differences from the game: no block collision, ground bounce or fluids; entities
 * summoned mid-tick start moving next tick; TNT explodes 0.0625 above its feet; aim at
 * feet;
 * unloaded chunks don't tick; arrows fired by mobs get random spread.
 */
export interface LaunchOptions {
  /** Which entity to model. Default {@link PROJECTILES.tnt}. */
  readonly projectile?: ProjectileProfile;
  /** Reject solutions slower than this, in blocks/tick. Default `0`. */
  readonly minSpeed?: number;
  /** Reject faster solutions, in blocks/tick. Default 10, vanilla's Motion limit. */
  readonly maxSpeed?: number;
  /** Earliest allowed flight time, in ticks. Default `1`. */
  readonly minTicks?: number;
  /**
   * Latest flight time. Defaults to the projectile's fuse (80 for TNT), so it doesn't
   * explode early.
   */
  readonly maxTicks?: number;
  /**
   * Launch angle range in degrees, negative is up. `[-90, -45]` for a lob, `[-20, 0]` for a
   * flat shot.
   */
  readonly pitchRange?: readonly [number, number];
  /**
   * Which exact solution to return:
   * - `"min-speed"` (default): slowest shot that reaches.
   * - `"min-time"`: flattest and fastest.
   * - `"max-time"`: highest lob that fits; clears walls.
   */
  readonly prefer?: "min-speed" | "min-time" | "max-time";
  /**
   * Flight times tried per tick. Default `1`. Raise for projectiles that must arrive
   * between ticks.
   */
  readonly subTickSamples?: number;
}

export interface LaunchSolution {
  /** Degrees, `0` = +Z (south), increasing clockwise from above. */
  readonly yaw: number;
  /** Degrees, `0` horizontal, negative up. */
  readonly pitch: number;
  /** Launch speed in blocks/tick (multiply by 20 for blocks/second). */
  readonly speed: number;
  /** The launch velocity itself - what goes in the `Motion` tag. */
  readonly velocity: Vec3;
  /** Flight time in ticks; use as the TNT fuse. */
  readonly ticks: number;
  /** Closest approach of the simulated flight to the target. */
  readonly impact: Vec3;
  /** Fractional tick at which that closest approach happens. */
  readonly impactTick: number;
  /** Blocks between {@link impact} and the target. Round-off (~1e-13) for a clean solve. */
  readonly error: number;
  /** The full simulated flight path, tick by tick - handy for previewing with particles. */
  readonly path: readonly Vec3[];
  readonly projectile: ProjectileProfile;
}
