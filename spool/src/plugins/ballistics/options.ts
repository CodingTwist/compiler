import { Selector } from "helix";
import type { NbtInput } from "helix";
import type { ProjectileProfile } from "./physics";
import { PROJECTILES } from "./physics";

/**
 * **The runtime half of `ballistics`: aim at a target that moves.**
 *
 * `ctx.ballistic()` solves at build time, so both endpoints are frozen into the emitted
 * `/summon`. The runtime shot solves **in game, every shot**, off two entities' live
 * positions - move the target and the next shot follows it.
 *
 * It can do that cheaply because of the affine structure `physics.ts` describes: once a
 * flight time `n` is fixed, the launch velocity is *one division*, not a search:
 *
 * ```
 *   v = (target - launcher - ĵ·G(n)) / A(n)
 * ```
 *
 * `A(n)` and `G(n)` are constants of the projectile, computed at build time and baked into
 * the function as scoreboard constants. What runs in game is only: read six coordinates,
 * subtract, scale, divide, write `Motion`. No iteration, no macros.
 *
 * The defaults are the common case - **`@s` throws at `@p`** - so a mob artillery piece is
 * just `execute as @e[type=blaze] run function <ns>:throw`.
 *
 * **The function returns `1` if it fired and `0` if it refused**, so the caller can react:
 * an animation on success, a different attack on failure. It refuses when the required
 * `Motion` exceeds vanilla's +/-10 b/t per axis, which vanilla *zeroes* rather than clamps
 * - i.e. would drop live TNT on the thrower. That refusal doubles as the range check.
 *
 * **The trade against the compile-time solver:** `n` is fixed at build time, so this picks
 * the arc that arrives in exactly `ticks` ticks rather than searching the family of exact
 * solutions for the min-speed / min-time / pitch-constrained one. Every option in
 * `LaunchOptions` that *selects among flight times* therefore has no meaning here - a
 * shorter `ticks` is a flatter, faster shot, a longer one a higher lob, and that is the
 * whole aiming vocabulary. The shot is still exact for the `n` you name.
 *
 * Precision: see the scales in `constants.ts` (~0.003 blocks of landing error, plus
 * ~0.04 % of range from rounding `A(n)` to centi-precision).
 */
export interface RuntimeShotOptions {
  /** Who throws it. Default `@s` - so the function is called *as* the thrower. */
  readonly from?: Selector;
  /** What to hit. Default `@p` - the thrower's nearest player. */
  readonly to?: Selector;
  /**
   * Flight time in ticks - the one aiming knob (see above). Default `40`. Also the TNT
   * `fuse`, so the shot airbursts on the target.
   */
  readonly ticks?: number;
  /**
   * Aim where the target *will be*, not where it is: adds `velocity × ticks` to the
   * target point. Off by default because it costs a per-tick tracker - see
   * `tracking.ts` for what that is and how enrolment keeps it cheap. Players only, so a
   * non-player target simply gets no lead (its velocity scores stay 0).
   */
  readonly lead?: boolean;
  /** Which entity to fire. Default {@link PROJECTILES.tnt}. */
  readonly projectile?: ProjectileProfile;
  /** Override the fuse, or `false` to leave the vanilla one (it lands instead of airbursting). */
  readonly fuse?: number | false;
  /** Extra NBT merged into the summon. */
  readonly nbt?: Record<string, NbtInput>;
}

/** The options with every default filled in - the one place they live. */
export function resolveShotOptions(opts: RuntimeShotOptions) {
  const ticks = Math.round(opts.ticks ?? 40);
  if (ticks < 1)
    throw new Error(`ballistics: ticks must be >= 1, got ${ticks}.`);
  return {
    ...opts,
    ticks,
    from: opts.from ?? Selector.self(),
    to: opts.to ?? Selector.nearest(),
    profile: opts.projectile ?? PROJECTILES.tnt,
  };
}
