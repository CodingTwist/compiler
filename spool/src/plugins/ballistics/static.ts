/**
 * **The build-time half of `ballistics`: both endpoints known now.**
 *
 * `solve.ts` inverts the flight exactly, here at compile time, and the result is frozen
 * into a single `/summon` with a literal `Motion` - nothing is computed in game, so the
 * shot costs one command and hits the same spot every run. That is the whole trade
 * against `runtime.ts`, which solves in game and can chase a moving target.
 *
 * Because the solve happens here, this half gets the *full* aiming vocabulary
 * ({@link LaunchOptions}: speed caps, pitch window, min-speed / min-time / max-time
 * preference). The runtime half has only a fixed flight time.
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
