/**
 * Build-time shots: solved now into one `/summon` with a fixed `Motion`.
 *
 * Costs one command and supports every {@link LaunchOptions}; use `runtime.ts` for moving
 * targets.
 */
import { Pos, round6 } from "helix";
import type { FunctionContext, Vec3 } from "helix";
import { shellFuse, summonShell, type ShellOptions } from "./shell";
import { solveLaunch, type LaunchOptions, type LaunchSolution } from "./solve";

/** {@link FunctionContext.ballistic}'s options: how to aim, plus what to throw. */
export interface BallisticOptions extends LaunchOptions, ShellOptions {}

/** Solve `from -> to` now and emit the `/summon` that performs it. */
export function emitStaticShot(
  ctx: FunctionContext,
  from: Vec3,
  to: Vec3,
  opts: BallisticOptions = {},
): LaunchSolution {
  const solution = solveLaunch(from, to, opts);
  summonShell(ctx, Pos(...from), {
    shell: opts.shell,
    // Six decimals is ~1e-6 blocks/tick, far below the tick granularity of the shot.
    motion: solution.velocity.map(round6),
    fuse: shellFuse(opts, solution.projectile, solution.ticks),
  });
  return solution;
}
