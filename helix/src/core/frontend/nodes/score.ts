import { TellrawPart } from "./tellraw_part";

import { ExpressionNode, Range, ASTNode } from "../../ir/node";
import { ScoreRangeNode } from "../../commands/if";
import { ExecuteStoreNode, StoreScoreNode } from "../../commands/execute_store";
import { ScoreOpNode, ScoreOperator } from "../../commands/score_op";
import { currentContext } from "../context/ambient";
import { Condition } from "../interfaces/condition";
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

  set(value: number, ctx?: FunctionContext): this {
    this.value = value;
    if (ctx) ctx.scoreSet(this);
    return this;
  }

  add(value: number, ctx?: FunctionContext): this {
    this.value = value;
    if (ctx) ctx.scoreAdd(this);
    return this;
  }

  remove(value: number, ctx?: FunctionContext): this {
    this.value = value;
    if (ctx) ctx.scoreRemove(this);
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
    const target = ctx ?? currentContext();
    if (!target)
      throw new Error(
        "Score arithmetic has no active context: call it inside a build()/run()/if() callback, or pass ctx explicitly.",
      );
    target.emit(new ScoreOpNode(this, op, other));
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

  applySet(ctx: FunctionContext): this {
    if (this.value === undefined)
      throw new Error("Score value not set. Use set(value) first.");
    ctx.scoreSet(this);
    return this;
  }

  storeResult(ctx: FunctionContext, command: ASTNode) {
    ctx.emit(
      new ExecuteStoreNode(
        "result",
        new StoreScoreNode(this.target, this.objective),
        command,
      ),
    );
  }

  toExecuteIf(): string {
    throw new Error("Method not implemented.");
  }

  invert(): Condition {
    throw new Error("Method not implemented.");
  }

  // toJson(): TextJson {
  //   return this.applyFormatting({
  //     score: { name: this.target, objective: this.objective.getName() },
  //   });
  // }
}
