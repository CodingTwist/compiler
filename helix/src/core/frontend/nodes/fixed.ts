import { Score } from "./score";
import type { FunctionContext } from "../context";
import { emitScoreExpr } from "../../commands/score-expr";
import { scoreOpNode } from "../../commands/scoreboard";
import { ContextInt as i } from "../../values/context-provider";

/**
 * A **fixed-point scalar**: one integer {@link Score} that stands for a fractional
 * value, encoded as `realValue × scale`. Minecraft scoreboards are integer-only, so
 * fractions are carried by a fixed `scale` factor - and every multiply/divide has to
 * rebalance it. Multiply two scaled values and the scale squares; divide and the
 * fraction is floored away. `Fixed` makes that bookkeeping part of the type and the
 * method names instead of a comment you have to keep in your head.
 *
 * **Why a scale `Score` and not just a number.** A `scoreboard players operation`
 * operand must itself be a score - you can't `*= 1000` against a literal. So a `Fixed`
 * that wants to multiply or divide by its own scale carries `scaleScore`, a slot
 * seeded once at load to `scale` (e.g. `ctx.scoreSet(scaleScore.set(1000))`). The
 * plain `number` `scale` is kept alongside for reasoning and asserts. Ops that don't
 * touch the scale (`assign`/`add`/`sub`/`negate`/`gain`/`reduce`/`clamp`) need no
 * `scaleScore`; {@link mul} and {@link divide} do.
 *
 * Like {@link Score}/{@link ScoreVec3} it holds a *reference* to an existing slot and
 * allocates nothing, emits into the **ambient** context (pass `ctx` to override), and
 * chains by returning `this`. Division floors toward −∞ (integer scoreboard divide).
 */
export class Fixed {
  constructor(
    public readonly score: Score,
    public readonly scale: number,
    public readonly scaleScore?: Score,
  ) {}

  private operand(other: Fixed | Score): Score {
    return other instanceof Fixed ? other.score : other;
  }

  private requireScale(): Score {
    if (!this.scaleScore)
      throw new Error(
        "Fixed: this op needs the scale score. Construct the Fixed with `scaleScore` (a slot seeded to `scale` at load) before calling mul()/divide().",
      );
    return this.scaleScore;
  }

  /** `this = other` (same scale; `other` may be a raw `Score` already at this scale). */
  assign(other: Fixed | Score, ctx?: FunctionContext): this {
    this.score.assign(this.operand(other), ctx);
    return this;
  }

  /** `this += other` - same-scale addition is just integer `+=`. */
  add(other: Fixed | Score, ctx?: FunctionContext): this {
    this.score.plus(this.operand(other), ctx);
    return this;
  }

  /** `this -= other` - same-scale subtraction is just integer `-=`. */
  sub(other: Fixed | Score, ctx?: FunctionContext): this {
    this.score.minus(this.operand(other), ctx);
    return this;
  }

  /**
   * Negate in place (`*= -1`). Pre-26.3 scoreboards have no unary minus, so this
   * multiplies by a caller-owned `-1` slot; on 26.3+ `/compute` negates directly
   * and `negOne` is never read - which is why it is optional. Omit it only in a
   * pack that targets 26.3+.
   */
  negate(negOne?: Score, ctx?: FunctionContext): this {
    emitScoreExpr(
      this.score,
      i.mul(i.score(this.score), -1),
      () => [scoreOpNode(this.score, "*=", needed(negOne, "negate() needs a `-1` slot on a pre-26.3 target."))],
      ctx,
    );
    return this;
  }

  /**
   * Fixed-point **multiply** by a same-scale `other`: `(a·scale)(b·scale)` would be
   * `(ab)·scale²`, so we divide the scale back out to stay at this scale. Emits `*=
   * other ; /= scale`. (Needs `scaleScore`.)
   */
  mul(other: Fixed, ctx?: FunctionContext): this {
    emitScoreExpr(
      this.score,
      i.floorDiv(i.mul(i.score(this.score), i.score(other.score)), this.scale),
      () => [
        scoreOpNode(this.score, "*=", other.score),
        scoreOpNode(this.score, "/=", this.requireScale()),
      ],
      ctx,
    );
    return this;
  }

  /**
   * Fixed-point **divide** by `divisor`, **precision-preserving**: pre-multiplies by
   * the scale so the integer `/=` keeps `scale` fractional bits - `(a·scale)·scale /
   * divisor` lands the quotient back at this scale instead of flooring to 0. This is
   * the operation that defuses the classic “small numerator ÷ large divisor truncates
   * to zero, the value silently vanishes” scoreboard bug. Emits `*= scale ; /=
   * divisor`. `divisor` is any `Score`/`Fixed`. (Needs `scaleScore`.)
   */
  divide(divisor: Fixed | Score, ctx?: FunctionContext): this {
    emitScoreExpr(
      this.score,
      i.floorDiv(i.mul(i.score(this.score), this.scale), i.score(this.operand(divisor))),
      () => [
        scoreOpNode(this.score, "*=", this.requireScale()),
        scoreOpNode(this.score, "/=", this.operand(divisor)),
      ],
      ctx,
    );
    return this;
  }

  /** Multiply by a **unitless** factor `k` (`*= k`); the scale is unchanged. */
  gain(k: Score, ctx?: FunctionContext): this {
    this.score.times(k, ctx);
    return this;
  }

  /**
   * Divide by a **unitless** integer factor `k` (`/= k`); the scale is unchanged.
   * Unlike {@link divide} this is a plain floor divide - use it for a gain/ratio
   * constant (e.g. a stiffness divisor), not for dividing by another measured value.
   */
  reduce(k: Score, ctx?: FunctionContext): this {
    this.score.divide(k, ctx);
    return this;
  }

  /** Clamp the underlying score into `[lo, hi]` (`< hi` then `> lo`). */
  clamp(lo: Score, hi: Score, ctx?: FunctionContext): this {
    clampScore(this.score, lo, hi, ctx);
    return this;
  }
}

/** `s = max(min(s, hi), lo)` - one `/compute` on 26.3+, the `< hi ; > lo` pair below it. */
export function clampScore(
  s: Score,
  lo: Score,
  hi: Score,
  ctx?: FunctionContext,
): void {
  emitScoreExpr(
    s,
    i.max(i.min(i.score(s), i.score(hi)), i.score(lo)),
    () => [scoreOpNode(s, "<", hi), scoreOpNode(s, ">", lo)],
    ctx,
  );
}

/** Demand a value the pre-26.3 lowering needs, at the point that lowering is chosen. */
function needed<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(`Fixed: ${message}`);
  return value;
}
