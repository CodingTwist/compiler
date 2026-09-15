// The condition nodes `ctx.if(...)` takes, and the if/elif/else node it emits.
import { ASTNode, ExpressionNode, FunctionNode, Range } from "../../ir/node";
import type { Objective } from "../../frontend/nodes/objective";
import type { Score } from "../../frontend/nodes/score";
import type { FunctionContext } from "../../frontend/context";
import { ScoreTarget } from "../../values/score_target";
import { Id } from "../../values/id";
import { PredicateRef } from "../../values/predicate";
import type { Detector } from "../../frontend/detect";
import type { Clause } from "../execute/types";

/** What `ctx.if(...)` and `and`/`or`/`not` take: a condition node or a {@link Detector}. */
export type Condition = ExpressionNode | Detector;

/** The `elif`/`else` continuation returned by `ctx.if(...)`. */
export interface IfBuilder {
  elif(condition: Condition, fn: (ctx: FunctionContext) => void): IfBuilder;
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
export function predicateCheck(
  ref: PredicateRef | Id | string,
): PredicateCheckNode {
  const id =
    ref instanceof PredicateRef
      ? ref.id
      : typeof ref === "string"
        ? Id(ref).render()
        : ref.render();
  return new PredicateCheckNode(id);
}

/** Passes when every condition passes. Built by {@link and}. */
export class AndNode extends ExpressionNode {
  type = "and";

  constructor(public conds: Condition[]) {
    super();
  }
}

/** Passes when any condition passes. Built by {@link or}. */
export class OrNode extends ExpressionNode {
  type = "or";

  constructor(public conds: Condition[]) {
    super();
  }
}

/** Passes when its condition fails. Built by {@link not}. */
export class NotNode extends ExpressionNode {
  type = "not";

  constructor(public cond: Condition) {
    super();
  }
}

/** A detector's `execute` clauses, recorded when `ctx.if` runs it. */
export class ClausesNode extends ExpressionNode {
  type = "clauses";

  constructor(public clauses: Clause[]) {
    super();
  }
}

/** Passes when every condition passes; folds into one `execute` chain. */
export function and(...conds: Condition[]): AndNode {
  return new AndNode(conds);
}

/** Passes when any condition passes. The body still runs at most once. */
export function or(...conds: Condition[]): OrNode {
  return new OrNode(conds);
}

/**
 * Passes when `cond` fails.
 *
 * Throws at build if `cond` forks (`as`, `at`, `on`…) or stores, since "no entity passes"
 * has no `unless` form.
 */
export function not(cond: Condition): NotNode {
  return new NotNode(cond);
}

export class IfElseNode extends ASTNode {
  type = "if_else";

  constructor(
    public condition: ExpressionNode,
    public thenBody: FunctionNode,
    public elifs: { condition: ExpressionNode; body: FunctionNode }[] = [],
    public elseBody?: FunctionNode,
    /** The local that records which branch ran, on versions without `return run`. */
    public taken?: Score,
  ) {
    super();
  }
}
