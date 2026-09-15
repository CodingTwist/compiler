import { TellrawPart } from "./tellraw_part";

import { ExpressionNode, Range } from "../../ir/node";
import { ScoreCompareNode, ScoreRangeNode } from "../../commands/if";
import {
  scoreOpNode,
  scoreLitNode,
  playersNode,
  ScoreOperator,
} from "../../commands/scoreboard";
import { currentContext, type EmitContext } from "../context/ambient";
import { Objective } from "./objective";
import { FunctionContext } from "../context";
import { ScoreTarget } from "../../values/score_target";

export class Score extends TellrawPart implements ExpressionNode {
  type: string = "score";

  constructor(
    public objective: Objective,
    public target: ScoreTarget,
  ) {
    super();
  }

  /** `matches <range>`: true when the score is in `range`. */
  matches(range: Range): ExpressionNode {
    return new ScoreRangeNode(this.target, this.objective, range);
  }

  /** `this = input`. */
  equal(input: number | Score): ExpressionNode {
    return this.compare("=", input);
  }

  /** `this > input`. */
  greaterThan(input: number | Score): ExpressionNode {
    return this.compare(">", input);
  }

  /** `this < input`. */
  lessThan(input: number | Score): ExpressionNode {
    return this.compare("<", input);
  }

  /** `this >= input`. */
  atLeast(input: number | Score): ExpressionNode {
    return this.compare(">=", input);
  }

  /** `this <= input`. */
  atMost(input: number | Score): ExpressionNode {
    return this.compare("<=", input);
  }

  /** A compare against another score, or `matches <range>` for a literal. */
  private compare(
    op: ScoreCompareNode["operator"],
    input: number | Score,
  ): ExpressionNode {
    if (input instanceof Score)
      return new ScoreCompareNode(
        this.target,
        this.objective,
        op,
        input.target,
        input.objective,
      );
    // Scores are integers, so strict bounds are one step in.
    const min =
      op === ">" ? input + 1 : op === "=" || op === ">=" ? input : undefined;
    const max =
      op === "<" ? input - 1 : op === "=" || op === "<=" ? input : undefined;
    return new ScoreRangeNode(this.target, this.objective, new Range(min, max));
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
    this.emitter(ctx).emit(scoreLitNode("set", this, value));
    return this;
  }

  /** `scoreboard players add <this> <value>`. */
  add(value: number, ctx?: FunctionContext): this {
    this.emitter(ctx).emit(scoreLitNode("add", this, value));
    return this;
  }

  /** `scoreboard players remove <this> <value>`. */
  remove(value: number, ctx?: FunctionContext): this {
    this.emitter(ctx).emit(scoreLitNode("remove", this, value));
    return this;
  }

  /** `scoreboard players get <this>`: the score as the command's result. */
  get(ctx?: FunctionContext): this {
    this.emitter(ctx).emit(playersNode("get", this));
    return this;
  }

  /** `scoreboard players reset <this>` - un-set this holder's score entirely. */
  reset(ctx?: FunctionContext): this {
    this.emitter(ctx).emit(playersNode("reset", this));
    return this;
  }

  /** `scoreboard players enable <this>`: lets the holder run `/trigger` on this trigger objective once. */
  enable(ctx?: FunctionContext): this {
    if (this.objective.kind !== "trigger")
      throw new Error(
        `Objective "${this.objective.getName()}" must be trigger to enable`,
      );
    this.emitter(ctx).emit(playersNode("enable", this));
    return this;
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
