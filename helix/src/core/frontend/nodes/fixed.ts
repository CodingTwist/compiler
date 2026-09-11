import { Score } from "./score";
import type { FunctionContext } from "../context";
import { math } from "./math";

/**
 * A **fixed-point scalar**: one integer {@link Score} that stands for a fractional
 * value, encoded as `realValue × scale`. Minecraft scoreboards are integer-only, so
 * fractions are carried by a fixed `scale` factor - and every multiply/divide has to
 * rebalance it. Multiply two scaled values and the scale squares; divide and the
 * fraction is floored away. `Fixed` makes that bookkeeping part of the type and the
 * method names instead of a comment you have to keep in your head.
 *
 * **Why a scale `Score` as well as a number.** A `scoreboard players operation`
 * operand must itself be a score - you can't `*= 1000` against a literal - so on a
 * pre-26.3 target a literal scale costs one extra `scoreboard players set <temp>
 * 1000` before every multiply. `scaleScore` is a slot seeded once at load to
 * `scale` (e.g. `ctx.scoreSet(scaleScore.set(1000))`) that removes that command.
 * It is a **hint, not a requirement**: omit it and the math is identical, one
 * command longer on ≤26.2 and exactly the same on 26.3+, where the whole formula
 * is one `/compute` and literals are free.
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
    math`${this.score} * ${negOne ?? -1}`.into(this.score, ctx);
    return this;
  }

  /**
   * Fixed-point **multiply** by a same-scale `other`: `(a·scale)(b·scale)` would be
   * `(ab)·scale²`, so we divide the scale back out to stay at this scale. Emits `*=
   * other ; /= scale`. (Needs `scaleScore`.)
   */
  mul(other: Fixed, ctx?: FunctionContext): this {
    math`${this.score} * ${other.score} / ${this.scaleScore ?? this.scale}`.into(
      this.score,
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
    math`${this.score} * ${this.scaleScore ?? this.scale} / ${this.operand(divisor)}`.into(
      this.score,
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
  math`max(min(${s}, ${hi}), ${lo})`.into(s, ctx);
}
