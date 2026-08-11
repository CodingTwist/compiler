import { Datapack, FunctionContext } from "helix";
import type { FunctionRef, Vec3 } from "helix";
import type { KitPlugin } from "../../plugin";
import { PROJECTILES } from "./physics";
import { defineRuntimeShot } from "./runtime";
import type { RuntimeShotOptions } from "./options";
import { emitStaticShot, type BallisticOptions } from "./static";
import type { LaunchSolution } from "./solve";

export { defineRuntimeShot } from "./runtime";
export type { RuntimeShotOptions } from "./options";
export { emitStaticShot } from "./static";
export type { BallisticOptions } from "./static";
export { DEFAULT_SHELL } from "./shell";
export type { ShellOptions, ShellSpec, ShellFactory } from "./shell";

export {
  PROJECTILES,
  MOTION_AXIS_LIMIT,
  simulate,
  stepOnce,
  trajectoryBasis,
  closestApproach,
} from "./physics";
export type {
  ProjectileProfile,
  TrajectoryBasis,
  Approach,
  Motion,
} from "./physics";
export { solveLaunch } from "./solve";
export type { LaunchOptions, LaunchSolution } from "./solve";

/**
 * **`ballistics`** - fire a projectile from A and have it arrive at B.
 *
 * The maths is `physics.ts` (Minecraft's real per-tick integrator, in vanilla's own
 * operation order) and `solve.ts` (an exact inversion of it). Read those two for the
 * physics, the coordinate conventions, and the accuracy caveats. This file is only the
 * plugin wiring; the two ways to *fire* live one per file:
 *
 * | | where it solves | file | entry point | aiming knobs |
 * | --- | --- | --- | --- | --- |
 * | **static** | at build time, endpoints baked into the `/summon` | `static.ts` | `ctx.ballistic(from, to)` | all of {@link LaunchOptions} |
 * | **runtime** | in game, from two entities' live positions | `runtime.ts` | `dp.ballisticRuntime(name)` | flight time only |
 *
 * Take the static one whenever both endpoints are known at build time - it is one command
 * and exact. Take the runtime one when the target moves. Either way *what* is thrown is
 * the same vocabulary - {@link ShellOptions} in `shell.ts`, which owns the single
 * `/summon` both halves emit: `projectile` picks whose flight the maths inverts, `shell`
 * is the author's own NBT for it.
 *
 * The solver is **pure and needs no install** - import `solveLaunch` from this subpath and
 * use it anywhere, including outside a datapack.
 *
 * ```ts
 * installKit([ballistics]);
 *
 * dp.createFunction("fire").build((ctx) => {
 *   const shot = ctx.ballistic([0, 70, 0], [120, 64, 40], { maxSpeed: 3 });
 *   // summon minecraft:tnt 0 70 0 {fuse:41s,Motion:[2.4...d,1.7...d,0.8...d]}
 *   console.log(shot.pitch, shot.speed, shot.error);
 * });
 *
 * // A diamond-block shell that chases whoever it is aimed at:
 * dp.ballisticRuntime("throw/mortar", {
 *   ticks: 70,
 *   lead: true,
 *   shell: (s) => Tnt({ ...s, blockState: Block.DIAMOND_BLOCK }),
 * });
 * ```
 */
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

export const ballistics: KitPlugin = {
  name: "ballistics",
  install(): void {
    FunctionContext.prototype.ballistic = function (
      this: FunctionContext,
      from: Vec3,
      to: Vec3,
      opts: BallisticOptions = {},
    ): LaunchSolution {
      return emitStaticShot(this, from, to, opts);
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
