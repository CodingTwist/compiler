import { Datapack, Double, EntityType, FunctionContext, Nbt, Pos, Short, round6 } from "helix";
import type { FunctionRef, NbtInput, Selector, Vec3 } from "helix";
import type { KitPlugin } from "../../plugin";
import { PROJECTILES } from "./physics";
import { defineRuntimeShot, type RuntimeShotOptions } from "./runtime";
import { solveLaunch, type LaunchOptions, type LaunchSolution } from "./solve";

export { defineRuntimeShot } from "./runtime";
export type { RuntimeShotOptions } from "./runtime";

export { PROJECTILES, MOTION_AXIS_LIMIT, simulate, stepOnce, trajectoryBasis, closestApproach } from "./physics";
export type { ProjectileProfile, TrajectoryBasis, Approach, Motion } from "./physics";
export { solveLaunch } from "./solve";
export type { LaunchOptions, LaunchSolution } from "./solve";

/**
 * **`ballistics`** - fire a projectile from A and have it arrive at B.
 *
 * The maths is `physics.ts` (Minecraft's real per-tick integrator, in vanilla's own
 * operation order) and `solve.ts` (an exact inversion of it). Read those two for the
 * physics, the coordinate conventions, and the accuracy caveats; this file is only the
 * thin command-emitting shell around them.
 *
 * The solver is **pure and needs no install** - import `solveLaunch` from this subpath and
 * use it anywhere, including outside a datapack. Installing the plugin adds one
 * convenience on top: {@link FunctionContext.ballistic}, which solves at build time and
 * emits the `/summon` that performs the shot.
 *
 * ```ts
 * installKit([ballistics]);
 *
 * dp.createFunction("fire").build((ctx) => {
 *   const shot = ctx.ballistic([0, 70, 0], [120, 64, 40], { maxSpeed: 3 });
 *   // summon minecraft:tnt 0 70 0 {fuse:41s,Motion:[2.4...d,1.7...d,0.8...d]}
 *   console.log(shot.pitch, shot.speed, shot.error);
 * });
 * ```
 *
 * Because that solve happens at **compile time**, both endpoints must be known then. For
 * a target that moves in game, {@link Datapack.ballisticRuntime} emits the same inversion
 * as scoreboard arithmetic against two entities' live positions - see `runtime.ts` for
 * what that costs (a fixed flight time, and centi-block precision).
 */
export interface BallisticOptions extends LaunchOptions {
  /**
   * Ticks on the TNT `fuse` tag. Defaults to the solved flight time, so it **airbursts on
   * the target**; pass a number to override, or `false` to leave the fuse alone (the
   * entity gets its vanilla 80 and lands/bounces instead). Ignored for projectiles with
   * no fuse.
   */
  readonly fuse?: number | false;
  /** Extra NBT merged into the summon (tags, custom name, `block_state`, …). */
  readonly nbt?: Record<string, NbtInput>;
}

declare module "helix" {
  interface FunctionContext {
    /**
     * Solve a launch from `from` to `to` at build time and emit the `/summon` that fires
     * it (installed by the `ballistics` plugin). Both points are **absolute** world
     * coordinates, feet-level, in blocks. Returns the full solution - yaw, pitch, speed,
     * flight time, simulated impact point and error - so the caller can log it, drive a
     * display entity's rotation with it, or preview `solution.path` with particles.
     *
     * Throws at build time if the constraints admit no shot. See {@link solveLaunch}.
     */
    ballistic(from: Vec3, to: Vec3, opts?: BallisticOptions): LaunchSolution;
  }

  interface Datapack {
    /**
     * Create a function `name` that solves the shot **in game, on every call**, from the
     * live positions of two entities - defaulting to `@s` throwing at `@p`, so
     * `execute as @e[type=blaze] run function <ns>:<name>` is a working mob artillery
     * piece. Returns `1` if it fired, `0` if the target was out of reach.
     * The build-time counterpart is {@link FunctionContext.ballistic}.
     *
     * The flight time is fixed at build time (`opts.ticks`, default 40) and is the only
     * aiming knob; see {@link RuntimeShotOptions} for why, for `lead` (hitting a *moving*
     * player), and for the precision this trades for 32-bit scoreboard arithmetic.
     */
    ballisticRuntime(name: string, opts?: RuntimeShotOptions): FunctionRef;
  }
}

/**
 * 1.21.5 renamed the TNT entity's NBT to snake_case (`Fuse` → `fuse`, `Block` →
 * `block_state`) along with the rest of the entity-data cleanup. The value is a short
 * either way.
 */
const TNT_SNAKE_NBT_DATA_VERSION = 4325;

export const ballistics: KitPlugin = {
  name: "ballistics",
  install(): void {
    FunctionContext.prototype.ballistic = function (
      this: FunctionContext,
      from: Vec3,
      to: Vec3,
      opts: BallisticOptions = {},
    ): LaunchSolution {
      const solution = solveLaunch(from, to, opts);
      const fuseKey = this.version.dataVersion >= TNT_SNAKE_NBT_DATA_VERSION ? "fuse" : "Fuse";
      const fuse =
        opts.fuse === false || solution.projectile.defaultFuse === undefined
          ? undefined
          : (opts.fuse ?? Math.round(solution.ticks));

      this.summon(
        EntityType(solution.projectile.id),
        Pos(...from),
        Nbt({
          ...(fuse === undefined ? {} : { [fuseKey]: Short(fuse) }),
          // Doubles, because `Motion` is a double list - a float list is read as zeroes.
          // Six decimals is ~1e-6 blocks/tick, far below the tick granularity of the shot.
          Motion: solution.velocity.map((c) => Double(round6(c))),
          ...opts.nbt,
        }),
      );
      return solution;
    };

    Datapack.prototype.ballisticRuntime = function (
      this: Datapack,
      name: string,
      opts?: RuntimeShotOptions,
    ): FunctionRef {
      return defineRuntimeShot(this, name, opts);
    };
  },
};

/** The default profile, re-exported for the common `PROJECTILES.tnt` case. */
export const TNT = PROJECTILES.tnt;
