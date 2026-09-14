// Vanilla projectile integration, the trajectory basis the solver inverts, and closest approach.
import type { Vec3 } from "helix";
import type { ProjectileProfile } from "./projectiles";

/** Mutable integrator state: position and velocity, both in blocks (per tick for `v`). */
export interface Motion {
  p: Vec3;
  v: Vec3;
}

/**
 * Runs one vanilla tick. `gravity` can be overridden so the basis uses this same function.
 *
 * Airborne only: no ground bounce or block collision.
 */
export function stepOnce(m: Motion, profile: ProjectileProfile, gravity = profile.gravity): void {
  if (profile.order === "gravity-move-drag") m.v[1] -= gravity;
  m.p[0] += m.v[0];
  m.p[1] += m.v[1];
  m.p[2] += m.v[2];
  if (profile.order === "move-gravity-drag") m.v[1] -= gravity;
  m.v[0] *= profile.drag;
  m.v[1] *= profile.dragY ?? profile.drag;
  m.v[2] *= profile.drag;
  if (profile.order === "move-drag-gravity") m.v[1] -= gravity;
}

/** Integrate `ticks` ticks from a launch, returning position at tick `0…ticks` inclusive. */
export function simulate(from: Vec3, velocity: Vec3, profile: ProjectileProfile, ticks: number): Vec3[] {
  const m: Motion = { p: [...from], v: [...velocity] };
  const path: Vec3[] = [[...m.p]];
  for (let n = 0; n < ticks; n++) {
    stepOnce(m, profile);
    path.push([...m.p]);
  }
  return path;
}

/**
 * How position after `n` ticks depends on launch velocity and gravity.
 *
 * ```
 *   p(n) = p₀ + (v₀ ∘ [A(n), Ay(n), A(n)]) + ĵ·G(n)
 * ```
 *
 * Measured by running {@link stepOnce}, not a formula, so it stays correct if the physics
 * change.
 * Solving for velocity is then division: `v_h = R / A(n)`, `v_y = (Δy − G(n)) / Ay(n)`.
 */
export interface TrajectoryBasis {
  /** `A[n]`: blocks travelled **horizontally** per 1 block/tick of launch velocity. */
  readonly A: readonly number[];
  /** `Ay[n]`: the same for the vertical axis - equal to `A` unless the drag is anisotropic. */
  readonly Ay: readonly number[];
  /** `G[n]`: the vertical drop (negative) gravity alone contributes after `n` ticks. */
  readonly G: readonly number[];
}

export function trajectoryBasis(profile: ProjectileProfile, ticks: number): TrajectoryBasis {
  const unit: Motion = { p: [0, 0, 0], v: [1, 0, 0] };
  const unitY: Motion = { p: [0, 0, 0], v: [0, 1, 0] };
  const dropped: Motion = { p: [0, 0, 0], v: [0, 0, 0] };
  const A: number[] = [0];
  const Ay: number[] = [0];
  const G: number[] = [0];
  for (let n = 0; n < ticks; n++) {
    stepOnce(unit, profile, 0); // horizontal velocity response: gravity off
    stepOnce(unitY, profile, 0); // vertical velocity response: gravity off
    stepOnce(dropped, profile); // gravity response: launched from rest
    A.push(unit.p[0]);
    Ay.push(unitY.p[1]);
    G.push(dropped.p[1]);
  }
  return { A, Ay, G };
}

/**
 * Samples a basis series at a fractional tick. Linear is exact: the game moves in a
 * straight line within a tick.
 */
export function sampleAt(series: readonly number[], t: number): number {
  const n = Math.floor(t);
  if (n >= series.length - 1) return series[series.length - 1];
  return series[n] + (t - n) * (series[n + 1] - series[n]);
}

/**
 * Closest approach of the flight path to a point, measured per segment.
 *
 * Checking only tick positions would miss fast projectiles that pass the target between
 * ticks.
 */
export interface Approach {
  /** Fractional tick of closest approach. */
  readonly tick: number;
  /** The point on the swept path nearest the target. */
  readonly point: Vec3;
  /** Distance in blocks from that point to the target. */
  readonly distance: number;
}

export function closestApproach(path: readonly Vec3[], target: Vec3): Approach {
  let best: Approach = { tick: 0, point: path[0], distance: dist(path[0], target) };
  for (let n = 0; n + 1 < path.length; n++) {
    const a = path[n];
    const b = path[n + 1];
    const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const lenSq = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
    // Degenerate (stationary) segment: the endpoint check above/below already covers it.
    const f =
      lenSq === 0
        ? 0
        : clamp01(
            ((target[0] - a[0]) * d[0] + (target[1] - a[1]) * d[1] + (target[2] - a[2]) * d[2]) / lenSq,
          );
    const point: Vec3 = [a[0] + f * d[0], a[1] + f * d[1], a[2] + f * d[2]];
    const distance = dist(point, target);
    if (distance < best.distance) best = { tick: n + f, point, distance };
  }
  return best;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
