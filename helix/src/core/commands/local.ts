// `ctx.let(init?)`: a compiler-named scratch score, so authors never pick holder names.
//
//   const dist = ctx.let(math`${dx} * ${dx} + ${dy} * ${dy}`);
//   ctx.if(dist.lessThan(100), (c) => c.say("close"));
import { FunctionNode } from "../ir/node";
import { FunctionContext } from "../frontend/context";
import { Objective } from "../frontend/nodes/objective";
import { Score } from "../frontend/nodes/score";
import { ScoreTarget } from "../values/score_target";
// Type-only, or it would close the command-file import cycle.
import type { MathExpr } from "../frontend/nodes/math";

/** The objective every local lives on; the pack declares it only if a function used one. */
export const LOCALS_OBJECTIVE = "helix.var";

/** A fresh local holder for `fn`, numbered on its root so a function's bodies never share one. */
export function allocLocal(fn: FunctionNode): Score {
  const root = fn.root;
  // Built per call: at module load `Objective` may not exist yet, due to the import cycle.
  return new Objective(LOCALS_OBJECTIVE).score(
    ScoreTarget(`#${root.name}.${root.locals++}`),
  );
}

declare module "../frontend/context" {
  interface FunctionContext {
    /**
     * A new local score, set to `init` if given.
     *
     * Holders are named per function, so a recursive call (or another pack's function with the
     * same name, called mid-function) overwrites its caller's locals.
     */
    let(init?: number | Score | MathExpr): Score;
  }
}

FunctionContext.prototype.let = function (
  this: FunctionContext,
  init?: number | Score | MathExpr,
): Score {
  const score = allocLocal(this.fn);
  if (typeof init === "number") score.set(init, this);
  else if (init instanceof Score) score.assign(init, this);
  else if (init) init.into(score, this);
  return score;
};
