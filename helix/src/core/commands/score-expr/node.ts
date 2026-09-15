// The score-arithmetic node, and the call that emits it into the ambient context.
import { ASTNode } from "../../ir/node";
import { Score } from "../../frontend/nodes/score";
import { ExprNode } from "../../frontend/nodes/expr";
import { currentContext } from "../../frontend/context/ambient";
import type { FunctionContext } from "../../frontend/context";
import { toStoredUnits } from "./units";

export class ScoreExprNode extends ASTNode {
  readonly type = "score-expr";
  constructor(
    /** The slot the expression's value lands in. */
    public readonly dest: Score,
    /** The formula, backend-agnostic. */
    public readonly expr: ExprNode,
  ) {
    super();
  }
}

/** Emit `dest = <expr>` into the ambient context (or `ctx`), backend chosen at codegen. */
export function emitScoreExpr(
  dest: Score,
  expr: ExprNode,
  ctx?: FunctionContext,
): void {
  const target = ctx ?? currentContext();
  if (!target)
    throw new Error(
      "Score arithmetic has no active context: call it inside a build()/run()/if() callback, or pass ctx explicitly.",
    );
  target.emit(new ScoreExprNode(dest, toStoredUnits(dest, expr)));
}
