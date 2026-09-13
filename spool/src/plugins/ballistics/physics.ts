import type { Vec3 } from "helix";

/**
 * Minecraft's per-tick projectile physics, in vanilla's exact order.
 *
 * The order changes the curve, so it's copied from the game:
 *
 * ```
 * PrimedTnt.tick():                         AbstractArrow / ThrowableProjectile.tick():
 *   if (!isNoGravity()) applyGravity();       move(SELF, deltaMovement);
 *   move(SELF, deltaMovement);                setDeltaMovement(delta.scale(inertia));
 *   setDeltaMovement(delta.scale(0.98));      if (!isNoGravity())
 *   if (onGround()) delta.multiply(.7,-.5,.7)   setDeltaMovement(delta.add(0,-gravity,0));
 *
 * LivingEntity.travel():                    // mobs, players, armor stands
 *   vec = handleRelativeFrictionAndCalculateMovement(...)   // this is the move
 *   double y = vec.y - getGravity();                        // 0.08
 *   float f1 = onGround() ? friction * 0.91F : 0.91F;
 *   setDeltaMovement(vec.x * f1, y * 0.98, vec.z * f1);
 * ```
 *
 * Drag is a constant scale and gravity a constant step, so position is affine in launch
 * velocity. That's what lets `solve.ts` invert it exactly.
 *
 * Axes: +X east, +Y up, +Z south. Yaw 0 faces south and increases clockwise; pitch is
 * negative
 * upward. TNT ignores rotation; yaw/pitch are just the direction of its `Motion`.
 */
export type TickOrder =
  /** `PrimedTnt`, `FallingBlockEntity`. */
  | "gravity-move-drag"
  /** `AbstractArrow`, `ThrowableProjectile`. */
  | "move-drag-gravity"
  /** `LivingEntity` - the gravity step is applied to the post-move delta, then dragged. */
  | "move-gravity-drag";

export interface ProjectileProfile {
  /** The entity id to `/summon`. */
  readonly id: string;
  /** Blocks/tick² subtracted from `vy` once per tick (`Entity.getDefaultGravity()`). */
  readonly gravity: number;
  /** Per-tick horizontal velocity multiplier. */
  readonly drag: number;
  /**
   * Per-tick vertical multiplier, if different from {@link drag} (living entities use
   * 0.98).
   */
  readonly dragY?: number;
  /** Where gravity falls relative to the move and drag. Changes the curve. */
  readonly order: TickOrder;
  /** `fuse` ticks a `/summon`ed one starts with, where the entity has a fuse at all. */
  readonly defaultFuse?: number;
}

/**
 * Projectiles that only feel drag and gravity, so the solver is exact for them.
 *
 * Fireballs, wind charges and shulker bullets are left out: they accelerate or steer
 * themselves.
 */
export const PROJECTILES = {
  /** `PrimedTnt`, the default. Gravity before the move, 2% drag. */
  tnt: { id: "minecraft:tnt", gravity: 0.04, drag: 0.98, order: "gravity-move-drag", defaultFuse: 80 },
  /** `FallingBlockEntity` - identical integrator to TNT, no fuse. */
  falling_block: { id: "minecraft:falling_block", gravity: 0.04, drag: 0.98, order: "gravity-move-drag" },
  /** `Arrow`: 1% drag, gravity after the move. */
  arrow: { id: "minecraft:arrow", gravity: 0.05, drag: 0.99, order: "move-drag-gravity" },
  spectral_arrow: { id: "minecraft:spectral_arrow", gravity: 0.05, drag: 0.99, order: "move-drag-gravity" },
  trident: { id: "minecraft:trident", gravity: 0.05, drag: 0.99, order: "move-drag-gravity" },
  /** `ThrowableItemProjectile` family - lighter gravity than an arrow. */
  snowball: { id: "minecraft:snowball", gravity: 0.03, drag: 0.99, order: "move-drag-gravity" },
  egg: { id: "minecraft:egg", gravity: 0.03, drag: 0.99, order: "move-drag-gravity" },
  ender_pearl: { id: "minecraft:ender_pearl", gravity: 0.03, drag: 0.99, order: "move-drag-gravity" },
  splash_potion: { id: "minecraft:splash_potion", gravity: 0.05, drag: 0.99, order: "move-drag-gravity" },
  experience_bottle: { id: "minecraft:experience_bottle", gravity: 0.07, drag: 0.99, order: "move-drag-gravity" },
  llama_spit: { id: "minecraft:llama_spit", gravity: 0.06, drag: 0.99, order: "move-drag-gravity" },
  /**
   * `LivingEntity`: every mob and the armor stand. The summoned entity comes from the
   * shell.
   *
   * Mobs with AI steer a little mid-air and land slightly off; `no_ai` mobs and armor
   * stands are exact.
   */
  living: { id: "minecraft:armor_stand", gravity: 0.08, drag: 0.91, dragY: 0.98, order: "move-gravity-drag" },
} as const satisfies Record<string, ProjectileProfile>;

/**
 * Max Motion per axis. Vanilla zeroes (not clamps) larger values, so the solver rejects
 * them.
 */
export const MOTION_AXIS_LIMIT = 10;

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
