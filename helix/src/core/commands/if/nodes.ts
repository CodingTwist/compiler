// The condition nodes `ctx.if(...)` takes, and the if/elif/else node it emits.
import { ASTNode, ExpressionNode, FunctionNode, Range } from "../../ir/node";
import type { Objective } from "../../frontend/nodes/objective";
import type { FunctionContext } from "../../frontend/context";
import { ScoreTarget } from "../../values/score_target";
import { Id } from "../../values/id";
import { PredicateRef } from "../../values/predicate";

/** The `elif`/`else` continuation returned by `ctx.if(...)`. */
export interface IfBuilder {
  elif(condition: ExpressionNode, fn: (ctx: FunctionContext) => void): IfBuilder;
  else(fn: (ctx: FunctionContext) => void): void;
}

// Score conditions for `if` and selector scores. Not commands; the `if` handler reads them.
export class ScoreCompareNode extends ExpressionNode {
  type = "score_compare";

  constructor(
    public target: ScoreTarget,
    public targetObjective: Objective,
    public operator: "<" | "<=" | "=" | ">=" | ">",
    public source: ScoreTarget,
    public sourceObjective: Objective,
  ) {
    super();
  }
}

export class ScoreRangeNode extends ExpressionNode {
  type = "score_range";

  constructor(
    public target: ScoreTarget,
    public targetObjective: Objective,
    public range: Range,
  ) {
    super();
  }
}

/** `if predicate <id>` - defers the test to a registered predicate file. */
export class PredicateCheckNode extends ExpressionNode {
  type = "predicate_check";

  constructor(public predicateId: string) {
    super();
  }
}

/**
 * A condition that passes when a {@link Predicate} passes, for `ctx.if(...)`.
 * Compiles to `execute if predicate <id>`.
 */
export function predicateCheck(ref: PredicateRef | Id | string): PredicateCheckNode {
  const id =
    ref instanceof PredicateRef ? ref.id : typeof ref === "string" ? Id(ref).render() : ref.render();
  return new PredicateCheckNode(id);
}

export class IfElseNode extends ASTNode {
  type = "if_else";

  constructor(
    public condition: ExpressionNode,
    public thenBody: FunctionNode,
    public elifs: { condition: ExpressionNode; body: FunctionNode }[] = [],
    public elseBody?: FunctionNode,
  ) {
    super();
  }
}
