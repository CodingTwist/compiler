import { Pos, Block, BLOCK_TAGS, Range, privateName } from "helix";
import type { FunctionRef } from "helix";
import type { RaycastState } from "./context";
import type { RaycastOptions } from "./index";

/** Air is the "keep going" block: the march steps forward while the cell ahead is air. */
const AIR = Block.tag(BLOCK_TAGS.AIR);

/**
 * Builds a recursive raycast into `fn`:
 *
 *   0. target reached? (with `stopAt`) run `onReach` and stop
 *   1. spend a step
 *   2. air ahead and steps left: step forward and recurse
 *   3. otherwise this is the hit: run `onHit`, if it matches `hitOn`
 */
export function buildMarcher(state: RaycastState, fn: FunctionRef, opts: RaycastOptions): void {
  const steps = state.steps(opts.name);
  const stepBlocks = opts.stepBlocks ?? 0.5;

  // Its own function so the marcher can `return run` it, stopping the recursion and
  // returning its result. Private: it's plumbing, not a name callers reach for.
  const reach = opts.stopAt
    ? state.dp.createFunction(privateName(`raycast/${opts.name}_reach`))
    : undefined;
  reach?.build((ctx) => opts.onReach?.(ctx));

  fn.build((ctx) => {
    // 0. Target in this cell: clear line of sight.
    if (reach) {
      ctx
        .execute()
        .ifEntity(opts.stopAt!)
        .run((b) => b.returnRun((r) => r.call(reach)));
    }

    // 1. Spend a step.
    steps.remove(1);

    // 2. Air ahead and steps left: move forward and recurse. `return run` so deeper hits
    // unwind cleanly.
    ctx
      .execute()
      .ifBlock(Pos.here(), AIR)
      .ifScoreMatches(steps, new Range(1, undefined))
      .positioned(Pos.local(0, 0, stepBlocks))
      .run((b) => b.returnRun((r) => r.call(fn)));

    // 3. The hit. With `hitOn`, a non-matching block is a miss.
    if (!opts.onHit) return;
    if (opts.hitOn) {
      ctx.execute().ifBlock(Pos.here(), opts.hitOn).run((b) => opts.onHit!(b));
    } else {
      opts.onHit(ctx);
    }
  });
}
