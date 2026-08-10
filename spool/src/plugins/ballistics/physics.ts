import type { Vec3 } from "helix";

/**
 * **The physics half of `ballistics`: Minecraft's real per-tick projectile integrator.**
 *
 * Nothing here is an idealised parabola. Every number below is transcribed from the
 * vanilla entity classes, and {@link stepOnce} performs the operations in the order the
 * game performs them - because that order is *observable*, not a detail:
 *
 * ```
 * PrimedTnt.tick():                         AbstractArrow / ThrowableProjectile.tick():
 *   if (!isNoGravity()) applyGravity();       move(SELF, deltaMovement);
 *   move(SELF, deltaMovement);                setDeltaMovement(delta.scale(inertia));
 *   setDeltaMovement(delta.scale(0.98));      if (!isNoGravity())
 *   if (onGround()) delta.multiply(.7,-.5,.7)   setDeltaMovement(delta.add(0,-gravity,0));
 * ```
 *
 * So **TNT applies gravity *before* it moves** (the very first tick of flight already
 * carries a full gravity step) and **drag *after*** (so the first tick's displacement is
 * the raw, undragged launch velocity). Arrows and throwables do the opposite - move,
 * drag, *then* gravity - which is why the same launch vector produces a different curve
 * for a snowball than for TNT. Getting that ordering backwards is a systematic ~1 tick
 * of gravity, roughly half a block over a long shot.
 *
 * Two further facts that shape the whole solver:
 *
 * - **Drag is isotropic.** `delta.scale(0.98)` multiplies *all three* axes, y included.
 *   Vertical velocity is dragged exactly like horizontal velocity, which is why TNT
 *   reaches a terminal state rather than falling forever: the stored `deltaMovement.y`
 *   converges on `-g·d/(1-d)` = `-1.96`, and since gravity is applied *before* the move,
 *   the observed fall rate settles at exactly `-2.0` blocks per tick.
 * - **Gravity is a constant additive step**, independent of velocity.
 *
 * Together those two make the tick map **affine in the launch velocity** - the property
 * {@link trajectoryBasis} exploits to invert the trajectory exactly. See `solve.ts`.
 *
 * ## Coordinate system and angle conventions
 *
 * Minecraft world axes: **+X east, +Y up, +Z south**. Rotation is stored as `[yaw, pitch]`
 * in degrees:
 *
 * - **yaw** `0` faces **+Z (south)** and increases **clockwise seen from above**, so `90`
 *   faces **-X (west)**, `180` faces `-Z` (north), `-90`/`270` faces `+X` (east).
 * - **pitch** `0` is horizontal, **negative is up**, positive is down (`-90` = straight up).
 *
 * The unit look vector for a rotation is therefore
 * `(-sin y · cos p, -sin p, cos y · cos p)`, and the inverse (used by the solver) is
 * `yaw = atan2(-vx, vz)`, `pitch = atan2(-vy, hypot(vx, vz))`.
 *
 * **TNT ignores rotation entirely** - it is launched by writing the `Motion` tag, a raw
 * velocity vector. The yaw/pitch a solution reports are the spherical decomposition of
 * that vector: useful to aim a display entity, a particle, or a bow-like projectile, and
 * exactly what you would feed `/summon` for an entity that *does* read rotation.
 */
export interface ProjectileProfile {
  /** The entity id to `/summon`. */
  readonly id: string;
  /** Blocks/tick² subtracted from `vy` once per tick (`Entity.getDefaultGravity()`). */
  readonly gravity: number;
  /** Per-tick velocity multiplier applied to **all three axes** (vanilla calls it inertia). */
  readonly drag: number;
  /**
   * `true` for the TNT/falling-block family (gravity → move → drag), `false` for the
   * arrow/throwable family (move → drag → gravity). Load-bearing; see the file docstring.
   */
  readonly gravityBeforeMove: boolean;
  /** `fuse` ticks a `/summon`ed one starts with, where the entity has a fuse at all. */
  readonly defaultFuse?: number;
}

/**
 * The projectiles whose flight is a pure drag+gravity integration, so the solver's
 * affine inversion is exact for them. Constants from each entity's `getDefaultGravity()`
 * and its `tick()`'s inertia scale.
 *
 * **Deliberately absent:** fireballs / wither skulls / dragon fireballs. Those are
 * *self-accelerating* (`AbstractHurtingProjectile` re-adds a `power` vector every tick
 * and has no gravity), so they are not a ballistic problem at all - they fly straight.
 * Wind charges and shulker bullets are likewise homing/steered. Adding one of those here
 * would be modelling it wrongly, so they are omitted rather than approximated.
 */
export const PROJECTILES = {
  /** `PrimedTnt` - the default. Gravity **before** the move, 2 % drag on every axis. */
  tnt: { id: "minecraft:tnt", gravity: 0.04, drag: 0.98, gravityBeforeMove: true, defaultFuse: 80 },
  /** `FallingBlockEntity` - identical integrator to TNT, no fuse. */
  falling_block: { id: "minecraft:falling_block", gravity: 0.04, drag: 0.98, gravityBeforeMove: true },
  /** `Arrow` - 1 % drag, gravity **after** the move. Ignores the `inGround` freeze. */
  arrow: { id: "minecraft:arrow", gravity: 0.05, drag: 0.99, gravityBeforeMove: false },
  spectral_arrow: { id: "minecraft:spectral_arrow", gravity: 0.05, drag: 0.99, gravityBeforeMove: false },
  trident: { id: "minecraft:trident", gravity: 0.05, drag: 0.99, gravityBeforeMove: false },
  /** `ThrowableItemProjectile` family - lighter gravity than an arrow. */
  snowball: { id: "minecraft:snowball", gravity: 0.03, drag: 0.99, gravityBeforeMove: false },
  egg: { id: "minecraft:egg", gravity: 0.03, drag: 0.99, gravityBeforeMove: false },
  ender_pearl: { id: "minecraft:ender_pearl", gravity: 0.03, drag: 0.99, gravityBeforeMove: false },
  splash_potion: { id: "minecraft:splash_potion", gravity: 0.05, drag: 0.99, gravityBeforeMove: false },
  experience_bottle: { id: "minecraft:experience_bottle", gravity: 0.07, drag: 0.99, gravityBeforeMove: false },
  llama_spit: { id: "minecraft:llama_spit", gravity: 0.06, drag: 0.99, gravityBeforeMove: false },
} as const satisfies Record<string, ProjectileProfile>;

/**
 * `Entity.load()` reads the `Motion` tag as
 * `Math.abs(component) > 10 ? 0 : component` - **per axis**. A launch vector with any
 * component past 10 blocks/tick doesn't get clamped, it gets *silently zeroed*, which
 * would drop the projectile straight down. The solver rejects such candidates.
 */
export const MOTION_AXIS_LIMIT = 10;

/** Mutable integrator state: position and velocity, both in blocks (per tick for `v`). */
export interface Motion {
  p: Vec3;
  v: Vec3;
}

/**
 * **One vanilla tick**, in vanilla's order. `gravity` is overridable so the basis
 * extraction can run the same integrator with gravity switched off - the trajectory
 * decomposition must come from *this* function, not a parallel re-derivation of it.
 *
 * Airborne only: the `onGround` branch (`multiply(0.7, -0.5, 0.7)` for TNT) and block
 * collision are not modelled, because a compile-time solver has no world to collide
 * with. See the accuracy notes in `solve.ts`.
 */
export function stepOnce(m: Motion, profile: ProjectileProfile, gravity = profile.gravity): void {
  if (profile.gravityBeforeMove) m.v[1] -= gravity;
  m.p[0] += m.v[0];
  m.p[1] += m.v[1];
  m.p[2] += m.v[2];
  m.v[0] *= profile.drag;
  m.v[1] *= profile.drag;
  m.v[2] *= profile.drag;
  if (!profile.gravityBeforeMove) m.v[1] -= gravity;
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
 * **The trajectory basis** - the one idea that makes an exact solver possible.
 *
 * Because drag is a constant isotropic scale and gravity a constant additive step, one
 * tick is an *affine* map of `(p, v)`. Composing `n` of them keeps it affine, so the
 * position after `n` ticks separates completely into a launch-velocity term and a
 * gravity term:
 *
 * ```
 *   p(n) = p₀ + v₀·A(n) + ĵ·G(n)
 * ```
 *
 * where `A(n)` is a **scalar** (the same for all three axes, since drag is isotropic) and
 * `G(n)` is the purely vertical drop a *dropped* projectile accumulates. Concretely
 * `A(n) = Σ dᵏ`, but we don't hard-code that series: `A` is measured by running
 * {@link stepOnce} with unit velocity and gravity disabled, and `G` by running it from
 * rest with gravity enabled. That keeps the basis honest by construction - if the tick
 * order or a constant changes, the basis changes with it, and the test asserts the
 * decomposition reproduces a directly-simulated trajectory to floating-point precision.
 *
 * Inverting for a launch velocity is then division, not search:
 * `v₀ = (target − p₀ − ĵ·G(n)) / A(n)`.
 */
export interface TrajectoryBasis {
  /** `A[n]`: blocks travelled per 1 block/tick of launch velocity, after `n` ticks. */
  readonly A: readonly number[];
  /** `G[n]`: the vertical drop (negative) gravity alone contributes after `n` ticks. */
  readonly G: readonly number[];
}

export function trajectoryBasis(profile: ProjectileProfile, ticks: number): TrajectoryBasis {
  const unit: Motion = { p: [0, 0, 0], v: [1, 0, 0] };
  const dropped: Motion = { p: [0, 0, 0], v: [0, 0, 0] };
  const A: number[] = [0];
  const G: number[] = [0];
  for (let n = 0; n < ticks; n++) {
    stepOnce(unit, profile, 0); // velocity response: gravity off
    stepOnce(dropped, profile); // gravity response: launched from rest
    A.push(unit.p[0]);
    G.push(dropped.p[1]);
  }
  return { A, G };
}

/**
 * Sample a basis series at a **fractional** tick. Within one tick the entity travels the
 * straight segment `p(n) → p(n+1)` in a single `move()` call, so linear interpolation of
 * the basis is not an approximation of the path - it *is* the path the game sweeps, which
 * is what makes sub-tick aiming and sub-tick crossing detection exact rather than fitted.
 */
export function sampleAt(series: readonly number[], t: number): number {
  const n = Math.floor(t);
  if (n >= series.length - 1) return series[series.length - 1];
  return series[n] + (t - n) * (series[n + 1] - series[n]);
}

/**
 * **Closest approach of the swept path to a point** - the verification pass, and the
 * reason a solution's reported error is trustworthy.
 *
 * Checking only the discrete tick positions would miss the common case: a fast projectile
 * steps *past* the target between two ticks, so the nearest tick sample can be half a
 * launch-speed away while the actual flight path passed through the target exactly. This
 * walks the real simulated polyline and takes the true point-to-**segment** distance on
 * every tick interval, returning a fractional tick index. Roughly: for segment
 * `a → b`, project `target − a` onto `b − a`, clamp the parameter to `[0, 1]`, measure.
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
