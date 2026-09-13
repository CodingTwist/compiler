import { TellrawPart } from "./tellraw_part";

import { ExpressionNode, Range } from "../../ir/node";
import { ScoreRangeNode } from "../../commands/if";
import { scoreOpNode, scoreLitNode, playersNode, ScoreOperator } from "../../commands/scoreboard";
import { currentContext, type EmitContext } from "../context/ambient";
import { Objective } from "./objective";
import { FunctionContext } from "../context";
import { ScoreTarget } from "../../values/score_target";

export class Score extends TellrawPart implements ExpressionNode {
  type: string = "score";

  value?: number;
  constructor(
    public objective: Objective,
    public target: ScoreTarget,
    value?: number,
  ) {
    super();
    if (value !== undefined) this.value = value;
  }

  /**
   * `matches <range>` - the general two-bounded form the other comparisons are
   * special cases of (`equal(n)` is `n..n`, `greaterThan(n)` is `n..`). Use it
   * when a condition spans a band of values rather than one edge.
   */
  matches(range: Range): ExpressionNode {
    return new ScoreRangeNode(this.target, this.objective, range);
  }

  equal(input: number | Score): ExpressionNode {
    if (input instanceof Score)
      throw new Error("Score-to-Score comparison not implemented.");
    return new ScoreRangeNode(
      this.target,
      this.objective,
      new Range(input, input),
    );
  }

  greaterThan(input: number | Score): ExpressionNode {
    if (input instanceof Score)
      throw new Error("Score-to-Score comparison not implemented.");
    return new ScoreRangeNode(
      this.target,
      this.objective,
      new Range(input, undefined),
    );
  }

  lessThan(input: number | Score): ExpressionNode {
    if (input instanceof Score)
      throw new Error("Score-to-Score comparison not implemented.");
    return new ScoreRangeNode(
      this.target,
      this.objective,
      new Range(undefined, input),
    );
  }

  /**
   * The context a mutating verb emits into: the explicit `ctx` if given, else
   * the ambient one (the `build`/`run`/`if` callback you are inside).
   */
  private emitter(ctx?: FunctionContext): EmitContext {
    const target = ctx ?? currentContext();
    if (!target)
      throw new Error(
        "Score mutation has no active context: call it inside a build()/run()/if() callback, or pass ctx explicitly.",
      );
    return target;
  }

  /** `scoreboard players set <this> <value>`. */
  set(value: number, ctx?: FunctionContext): this {
    this.value = value;
    this.emitter(ctx).emit(scoreLitNode("set", this, value));
    return this;
  }

  /** `scoreboard players add <this> <value>`. */
  add(value: number, ctx?: FunctionContext): this {
    this.value = value;
    this.emitter(ctx).emit(scoreLitNode("add", this, value));
    return this;
  }

  /** `scoreboard players remove <this> <value>`. */
  remove(value: number, ctx?: FunctionContext): this {
    this.value = value;
    this.emitter(ctx).emit(scoreLitNode("remove", this, value));
    return this;
  }

  /** `scoreboard players reset <this>` - un-set this holder's score entirely. */
  reset(ctx?: FunctionContext): this {
    this.emitter(ctx).emit(playersNode("reset", this));
    return this;
  }

  copy(ctx: FunctionContext, score: Score) {
    ctx.scoreSetScore(this, score)
  }

  /**
   * `scoreboard players operation <this> <op> <other>` - typed score-to-score
   * arithmetic. The named verbs below (`plus`, `times`, …) delegate here; use
   * this directly only for a dynamic operator. Returns `this`, so a run of
   * operations on the same score chains: `acc.times(k).plus(d)`.
   *
   * The emitting context is the ambient one (the `build`/`run`/`if` callback you
   * are inside). Pass `ctx` explicitly only to override it - e.g. when two
   * contexts are in scope and you mean the outer one. See {@link currentContext}.
   */
  operation(op: ScoreOperator, other: Score, ctx?: FunctionContext): this {
    this.emitter(ctx).emit(scoreOpNode(this, op, other));
    return this;
  }

  /** `this = other` (`scoreboard players operation … =`). */
  assign(other: Score, ctx?: FunctionContext): this {
    return this.operation("=", other, ctx);
  }
  /** `this += other`. (`add` is taken for the literal `scoreboard players add`.) */
  plus(other: Score, ctx?: FunctionContext): this {
    return this.operation("+=", other, ctx);
  }
  /** `this -= other`. (`remove` is taken for the literal `scoreboard players remove`.) */
  minus(other: Score, ctx?: FunctionContext): this {
    return this.operation("-=", other, ctx);
  }
  /** `this *= other`. */
  times(other: Score, ctx?: FunctionContext): this {
    return this.operation("*=", other, ctx);
  }
  /** `this /= other` (integer division, floors toward −∞). */
  divide(other: Score, ctx?: FunctionContext): this {
    return this.operation("/=", other, ctx);
  }
  /** `this %= other`. */
  modulo(other: Score, ctx?: FunctionContext): this {
    return this.operation("%=", other, ctx);
  }
  /** `this = min(this, other)` (`<`). */
  min(other: Score, ctx?: FunctionContext): this {
    return this.operation("<", other, ctx);
  }
  /** `this = max(this, other)` (`>`). */
  max(other: Score, ctx?: FunctionContext): this {
    return this.operation(">", other, ctx);
  }
  /** Swap the two scores (`><`). */
  swap(other: Score, ctx?: FunctionContext): this {
    return this.operation("><", other, ctx);
  }

}
