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

  /** `matches <range>`: true when the score is in `range`. */
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

  /** The explicit `ctx` if given, else the ambient one. */
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
   * `scoreboard players operation <this> <op> <other>`. Chains; prefer the named verbs
   * (`plus`, `times`…).
   *
   * Emits into the ambient context; pass `ctx` to override. See {@link currentContext}.
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
