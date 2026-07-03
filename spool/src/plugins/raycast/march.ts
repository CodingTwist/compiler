import { Pos, Block, BLOCK_TAGS, Range } from "helix";
import type { FunctionRef } from "helix";
import type { RaycastState } from "./context";
import type { RaycastOptions } from "./index";

/** Air is the "keep going" block: the march steps forward while the cell ahead is air. */
const AIR = Block.tag(BLOCK_TAGS.AIR);

/**
 * Build one raycast marcher into `fn`: a recursive step-and-check along the local
 * forward axis (`^`), the classic datapack ray. Reads top-down as the ray's story:
 *
 *   1. spend a step   (decrement this marcher's budget)
 *   2. air ahead + budget left → step forward and recurse (carry the position via `^`)
 *   3. otherwise this cell is the hit → run the caller's `onHit`, gated on `hitOn`
 *      when set (a non-matching block is treated as a miss: `onHit` simply doesn't fire)
 *
 * The marcher is position-agnostic: the caller supplies the origin and facing by
 * invoking `RaycastRef.cast` from an already-`positioned`/`anchored` context, so this
 * knows nothing about eyes, entities, or namespaces - only "march `^` through air."
 */
export function buildMarcher(state: RaycastState, fn: FunctionRef, opts: RaycastOptions): void {
  const steps = state.steps(opts.name);
  const stepBlocks = opts.stepBlocks ?? 0.5;

  fn.build((ctx) => {
    // 1. Spend a step of this marcher's reach budget.
    ctx.scoreRemove(steps.remove(1));

    // 2. Air ahead and budget remaining: step a stride along ^ and recurse (carry
    //    the marched-to position through `positioned`). `return run` tail-calls so a
    //    hit deeper in the recursion still unwinds cleanly.
    ctx
      .execute()
      .ifBlock(Pos.here(), AIR)
      .ifScoreMatches(steps, new Range(1, undefined))
      .positioned(Pos.local(0, 0, stepBlocks))
      .run((b) => b.returnRun((r) => r.call(fn)));

    // 3. This cell is the hit. Run the caller's on-hit body here (positioned at the hit
    //    block). With `hitOn` set, gate it: a non-matching block places nothing, so the
    //    caller sees a clean miss.
    if (opts.hitOn) {
      ctx.execute().ifBlock(Pos.here(), opts.hitOn).run((b) => opts.onHit(b));
    } else {
      opts.onHit(ctx);
    }
  });
}
