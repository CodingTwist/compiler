import { Pos, Block, BLOCK_TAGS, Detect, and, not } from "helix";
import type { Datapack, FunctionRef, Score } from "helix";
import type { RaycastOptions } from "./index";

/** Air is the "keep going" block: the march steps forward while the cell ahead is air. */
const AIR = Block.tag(BLOCK_TAGS.AIR);

/**
 * Builds the raycast into `fn`: a loop that steps forward while the cell is air, steps
 * remain and `stopAt` isn't here, then runs `onReach` (returning its result) or `onHit`.
 */
export function buildMarcher(
  dp: Datapack,
  fn: FunctionRef,
  steps: Score,
  opts: RaycastOptions,
): void {
  const stepBlocks = opts.stepBlocks ?? 0.5;

  // Its own function so the exit can `return run` it and return its result.
  const reach = opts.stopAt
    ? dp.createFunction(`${opts.name}_reach`)
    : undefined;
  reach?.build((ctx) => opts.onReach?.(ctx));

  const open = and(
    Detect.block(Pos.here(), AIR),
    steps.atLeast(1),
    ...(opts.stopAt ? [not(Detect.entity(opts.stopAt))] : []),
  );

  // `return run` so the loop's result is the ray's, for `execute if function <cast>`.
  fn.build((ctx) =>
    ctx.returnRun((r) =>
      r
        .while(open, () => void steps.remove(1), {
          advance: (e) => e.positioned(Pos.local(0, 0, stepBlocks)),
        })
        .else((c) => {
          // Checked before the hit, so the target's own cell never counts as a block hit.
          if (reach)
            c.execute()
              .ifEntity(opts.stopAt!)
              .run((b) => b.returnRun((x) => x.call(reach)));
          if (!opts.onHit) return;
          if (opts.hitOn)
            c.execute()
              .ifBlock(Pos.here(), opts.hitOn)
              .run((b) => opts.onHit!(b));
          else opts.onHit(c);
        }),
    ),
  );
}
