import { Datapack, FunctionContext } from "helix";
import type { FunctionRef, Vec3 } from "helix";
import type { KitPlugin } from "../../plugin";
import { PROJECTILES } from "./projectiles";
import { defineRuntimeShot } from "./runtime";
import type { RuntimeShotOptions } from "./options";
import { emitStaticShot, type BallisticOptions } from "./static";
import type { LaunchSolution } from "./launch";

export { defineRuntimeShot } from "./runtime";
export type { RuntimeShotOptions } from "./options";
export { emitStaticShot } from "./static";
export type { BallisticOptions } from "./static";
export { DEFAULT_SHELL } from "./shell";
export type { ShellOptions, ShellSpec, ShellFactory } from "./shell";

export { simulate, stepOnce, trajectoryBasis, closestApproach } from "./physics";
export { PROJECTILES, MOTION_AXIS_LIMIT } from "./projectiles";
export type { TrajectoryBasis, Approach, Motion } from "./physics";
export type { ProjectileProfile } from "./projectiles";
export { solveLaunch } from "./solve";
export type { LaunchOptions, LaunchSolution } from "./launch";

/**
 * `ballistics`: fire a projectile from A so it lands on B.
 *
 * - Static, `ctx.ballistic(from, to)`: solved at build time into one exact `/summon`. Use
 * when
 *   both points are known.
 * - Runtime, `dp.ballisticRuntime(name)`: solved in game from live positions. Use when the
 * target moves.
 *
 * The maths is in `physics.ts` and `solve.ts`. `solveLaunch` is pure and needs no install.
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
     * Solves a launch from `from` to `to` at build time and emits the `/summon`.
     *
     * Points are absolute feet positions. Returns the full solution (yaw, pitch, speed,
     * time, error).
     * Throws if no shot fits the constraints. See {@link solveLaunch}.
     */
    ballistic(from: Vec3, to: Vec3, opts?: BallisticOptions): LaunchSolution;
  }

  interface Datapack {
    /**
     * Creates a function `name` that aims and fires in game from live positions. Default:
     * `@s` at `@p`.
     *
     * Returns `1` if it fired, `0` if the target was out of reach. Flight time is fixed at
     * build time;
     * see {@link RuntimeShotOptions}.
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
