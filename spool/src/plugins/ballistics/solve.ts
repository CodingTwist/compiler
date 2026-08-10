import type { Vec3 } from "helix";
import {
  MOTION_AXIS_LIMIT,
  PROJECTILES,
  closestApproach,
  sampleAt,
  simulate,
  trajectoryBasis,
  type ProjectileProfile,
} from "./physics";

/**
 * **The solver.** Given a launch point, a target point and a speed budget, find the
 * launch velocity - reported as yaw / pitch / speed - whose *tick-simulated* flight
 * passes through the target.
 *
 * ## Why there is no root-finding loop
 *
 * The naive approach is a two-dimensional search: guess a pitch, guess a speed, simulate,
 * measure the miss, iterate. That's slow *and* fragile (the miss function is
 * non-monotonic in pitch). It's also unnecessary, because of the affine structure in
 * `physics.ts`:
 *
 * ```
 *   p(t) = p₀ + v₀·A(t) + ĵ·G(t)
 * ```
 *
 * `A` and `G` are fixed once the projectile type is chosen - they don't depend on the
 * launch at all. So **flight time is the only free parameter**. Pick a time of flight `t`
 * and the required launch velocity falls out by division, exactly:
 *
 * ```
 *   horizontal:  v_h = R / A(t)                 R = horizontal distance to target
 *   vertical:    v_y = (Δy − G(t)) / A(t)
 * ```
 *
 * Every `t` for which `A(t) > 0` yields a launch that hits the target *dead on*. That
 * turns "solve for speed and angle" into "choose among the one-parameter family of exact
 * solutions", and the constraints (speed range, pitch range, fuse length, the per-axis
 * `Motion` limit) become a filter rather than something to search against.
 *
 * The scan over `t` is therefore not a convergence loop - it is enumeration of candidate
 * solutions, each already exact, ranked by {@link LaunchOptions.prefer}. A coarser scan
 * can only return a *less preferred* solution, never a less accurate one. That is the
 * property that lets the default scan be one sample per tick.
 *
 * ## Why the default is whole ticks
 *
 * TNT detonates when its `fuse` counter hits zero, at the *end* of a tick, at whatever
 * position it holds then - i.e. exactly at a tick sample. Solving on integer ticks makes
 * `fuse = t` an airburst centred on the target with no rounding error at all. Raise
 * {@link LaunchOptions.subTickSamples} when the projectile is meant to physically arrive
 * somewhere (an arrow hitting a mob) rather than explode on a timer.
 *
 * ## Accuracy: what you actually get, and what can still differ
 *
 * The returned `error` is not an estimate. Every solution is re-flown through the real
 * {@link simulate} integrator and measured with {@link closestApproach} against the swept
 * path, so `error` is the true closest approach of the modelled flight. It comes back at
 * ~1e-13 blocks (double-precision round-off); anything larger is a real signal that a
 * constraint bent the solution.
 *
 * Against that, the ways the *game's* TNT can still diverge:
 *
 * 1. **Blocks.** `move()` does collision resolution; this solver has no world. A
 *    trajectory that clips terrain, a wall, or the ceiling stops there. Check the arc is
 *    clear, or use `prefer: "min-time"` for a flatter, shorter path.
 * 2. **The ground bounce.** On contact TNT's velocity becomes `(0.7, −0.5, 0.7)×` - not
 *    modelled, and irrelevant if the shot airbursts before landing.
 * 3. **Water / lava.** Buoyancy and fluid drag replace the air model entirely.
 * 4. **Spawn timing.** An entity summoned mid-tick is queued and first ticks on the
 *    *following* tick, so flight time is counted from the tick after the `/summon`. If
 *    the launcher runs in a chain of functions this is consistent; if you compare against
 *    a manually-placed TNT, expect a one-tick offset.
 * 5. **The explosion is offset.** `PrimedTnt` explodes at `getY(0.0625)`, i.e. **6.1 cm
 *    above** the entity's feet position, and blast damage is computed from there.
 * 6. **Where the entity sits.** `/summon` places the entity's feet at the coordinate you
 *    give; the arc is solved for that same feet point, so aim at your target's feet too
 *    (or add the eye height yourself).
 * 7. **Chunk loading.** An unloaded destination means nothing ticks there. Forceload the
 *    corridor for long shots.
 * 8. **Other projectiles.** Arrows fired by an entity get random spread applied to the
 *    launch vector; only a directly-`Motion`-set arrow follows this model.
 */
export interface LaunchOptions {
  /** Which entity to model. Default {@link PROJECTILES.tnt}. */
  readonly projectile?: ProjectileProfile;
  /** Reject solutions slower than this, in blocks/tick. Default `0`. */
  readonly minSpeed?: number;
  /**
   * Reject solutions faster than this, in blocks/tick. Default `MOTION_AXIS_LIMIT` (10) -
   * the point past which vanilla zeroes the `Motion` tag. A per-axis check applies too.
   */
  readonly maxSpeed?: number;
  /** Earliest allowed flight time, in ticks. Default `1`. */
  readonly minTicks?: number;
  /**
   * Latest allowed flight time. Defaults to the projectile's fuse (80 for TNT) - a longer
   * flight would detonate in the air on the way there.
   */
  readonly maxTicks?: number;
  /**
   * Restrict the launch angle, `[min, max]` in degrees, **negative is up**. `[-90, -45]`
   * forces a mortar-style lob; `[-20, 0]` a flat direct-fire shot.
   */
  readonly pitchRange?: readonly [number, number];
  /**
   * Which of the exact solutions to return:
   * - `"min-speed"` (default) - the least energetic shot that reaches, the classic
   *   artillery solution and the most forgiving of a speed cap.
   * - `"min-time"` - flattest and fastest to arrive; least time for a target to move,
   *   but the highest speed and the lowest clearance over terrain.
   * - `"max-time"` - the highest lob that still fits the budget; clears walls.
   */
  readonly prefer?: "min-speed" | "min-time" | "max-time";
  /**
   * Candidate flight times sampled per tick. Default `1` (whole ticks only - see the
   * fuse note above). Raise for a projectile that must physically arrive between ticks.
   */
  readonly subTickSamples?: number;
}

export interface LaunchSolution {
  /** Degrees, `0` = +Z (south), increasing clockwise from above. */
  readonly yaw: number;
  /** Degrees, `0` = horizontal, **negative = upward**. */
  readonly pitch: number;
  /** Launch speed in blocks/tick (multiply by 20 for blocks/second). */
  readonly speed: number;
  /** The launch velocity itself - what goes in the `Motion` tag. */
  readonly velocity: Vec3;
  /** Flight time in ticks. Use as the TNT `fuse` for an airburst on target. */
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

/**
 * Solve a launch. Throws with a diagnostic if the constraints admit nothing - a
 * compile-time failure is the right outcome, since a datapack that silently emits a shot
 * that cannot reach is worse than one that fails to build.
 */
export function solveLaunch(from: Vec3, to: Vec3, opts: LaunchOptions = {}): LaunchSolution {
  const profile = opts.projectile ?? PROJECTILES.tnt;
  const maxTicks = Math.floor(opts.maxTicks ?? profile.defaultFuse ?? 200);
  const minTicks = Math.max(opts.minTicks ?? 1, 1);
  const samples = Math.max(1, Math.round(opts.subTickSamples ?? 1));
  const minSpeed = opts.minSpeed ?? 0;
  const maxSpeed = opts.maxSpeed ?? MOTION_AXIS_LIMIT;
  if (maxTicks < minTicks) {
    throw new Error(`ballistics: maxTicks (${maxTicks}) is below minTicks (${minTicks}).`);
  }

  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const range = Math.hypot(dx, dz);
  // A launch straight up/down has no horizontal direction to recover; keep yaw at 0
  // rather than letting atan2(0, 0) decide it.
  const [ux, uz] = range < 1e-9 ? [0, 0] : [dx / range, dz / range];

  // The basis only needs building once - it is a property of the projectile, not the shot.
  const { A, G } = trajectoryBasis(profile, maxTicks);

  let best: { t: number; v: Vec3; speed: number; score: number } | undefined;
  let closestSpeed = Infinity; // for the diagnostic when nothing fits the speed budget
  for (let i = minTicks * samples; i <= maxTicks * samples; i++) {
    const t = i / samples;
    const a = sampleAt(A, t);
    if (a <= 0) continue;

    // The exact inverse: horizontal displacement is v_h·A, vertical is v_y·A + G.
    const vh = range / a;
    const vy = (dy - sampleAt(G, t)) / a;
    const v: Vec3 = [vh * ux, vy, vh * uz];
    const speed = Math.hypot(vh, vy);

    closestSpeed = Math.min(closestSpeed, speed);
    if (speed < minSpeed || speed > maxSpeed) continue;
    // Per-axis, because vanilla zeroes an axis over the limit rather than clamping it.
    if (v.some((c) => Math.abs(c) > MOTION_AXIS_LIMIT)) continue;
    const pitch = pitchOf(v);
    if (opts.pitchRange && (pitch < opts.pitchRange[0] || pitch > opts.pitchRange[1])) continue;

    const score = opts.prefer === "min-time" ? t : opts.prefer === "max-time" ? -t : speed;
    if (!best || score < best.score) best = { t, v, speed, score };
  }

  if (!best) throw noSolution(from, to, opts, { minSpeed, maxSpeed, minTicks, maxTicks, closestSpeed });

  // Verify against the real integrator rather than trusting the algebra: fly the solved
  // velocity and measure the swept path's true closest approach to the target.
  const path = simulate(from, best.v, profile, maxTicks);
  const hit = closestApproach(path, to);

  return {
    yaw: yawOf(best.v),
    pitch: pitchOf(best.v),
    speed: best.speed,
    velocity: best.v,
    ticks: best.t,
    impact: hit.point,
    impactTick: hit.tick,
    error: hit.distance,
    path,
    projectile: profile,
  };
}

/** `yaw = atan2(-x, z)`: the inverse of Minecraft's `(-sin y·cos p, -sin p, cos y·cos p)`. */
function yawOf(v: Vec3): number {
  const range = Math.hypot(v[0], v[2]);
  return range < 1e-9 ? 0 : (Math.atan2(-v[0], v[2]) * 180) / Math.PI;
}

/** `pitch = atan2(-y, |horizontal|)`, so upward velocity gives a negative pitch. */
function pitchOf(v: Vec3): number {
  return (Math.atan2(-v[1], Math.hypot(v[0], v[2])) * 180) / Math.PI;
}

/** Say *which* constraint bit, not just "no solution" - the speed budget is the usual one. */
function noSolution(
  from: Vec3,
  to: Vec3,
  opts: LaunchOptions,
  ctx: { minSpeed: number; maxSpeed: number; minTicks: number; maxTicks: number; closestSpeed: number },
): Error {
  const reach = Number.isFinite(ctx.closestSpeed)
    ? `the cheapest arc in ${ctx.minTicks}-${ctx.maxTicks} ticks needs ${ctx.closestSpeed.toFixed(3)} blocks/tick`
    : `no flight time in ${ctx.minTicks}-${ctx.maxTicks} ticks reaches it`;
  const pitch = opts.pitchRange ? ` within pitch ${opts.pitchRange[0]}..${opts.pitchRange[1]}` : "";
  return new Error(
    `ballistics: no launch from [${from}] hits [${to}]${pitch} with speed in ` +
      `${ctx.minSpeed}..${ctx.maxSpeed} blocks/tick - ${reach}. ` +
      `Raise maxSpeed/maxTicks, or move the target closer.`,
  );
}
