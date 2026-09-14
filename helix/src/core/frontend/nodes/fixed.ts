import { Score } from "./score";
import type { FunctionContext } from "../context";
import { currentContext } from "../context/ambient";
import type { Selector } from "./selector";
import type { NbtPath } from "../../values/nbt";
// Type-only, to avoid the import cycle (see CLAUDE.md).
import type { StoreNumType } from "../../commands/execute";
import { math } from "./math";

/** The explicit `ctx` if given, else the ambient one; NBT reads need `execute`. */
function emitInto(ctx?: FunctionContext): FunctionContext {
  const target = ctx ?? (currentContext() as FunctionContext | undefined);
  if (!target) throw new Error("Fixed: no active function context - pass `ctx` outside a builder callback.");
  return target;
}

/**
 * A fixed-point number: one integer {@link Score} holding `realValue × scale`.
 *
 * Scoreboards are integers, so multiply and divide must rebalance the scale; the method
 * names
 * handle that. `scaleScore` is an optional slot holding `scale` that saves one command per
 * multiply below 26.3 (the scoreboard can't use a literal operand).
 *
 * Holds a reference to an existing slot, emits into the ambient context (or `ctx`), and
 * chains.
 * Division floors toward −∞.
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

  /** Reads the number at `path` on `who` into this, at this scale. */
  read(who: Selector, path: NbtPath, ctx?: FunctionContext): this {
    emitInto(ctx)
      .execute()
      .storeResultScore(this.score)
      .run((c) => c.entity(who).get(path, this.scale));
    return this;
  }

  /** Writes this to `path` on `who` as a real number, times a unitless `factor`. */
  store(who: Selector, path: NbtPath, type: StoreNumType = "double", factor = 1, ctx?: FunctionContext): this {
    emitInto(ctx)
      .execute()
      .storeResultEntity(who, path, type, factor / this.scale)
      .run((c) => this.score.get(c));
    return this;
  }

  /** `this = other` (same scale; `other` may be a raw `Score` already at this scale). */
  assign(other: Fixed | Score, ctx?: FunctionContext): this {
    this.score.assign(this.operand(other), ctx);
    return this;
  }

  /** `this += other` - same-scale addition is just integer `+=`. */
  add(other: Fixed | Score, ctx?: FunctionContext): this {
    math`${this.score} + ${this.operand(other)}`.into(this.score, ctx);
    return this;
  }

  /** `this -= other` - same-scale subtraction is just integer `-=`. */
  sub(other: Fixed | Score, ctx?: FunctionContext): this {
    math`${this.score} - ${this.operand(other)}`.into(this.score, ctx);
    return this;
  }

  /** Negates in place. Below 26.3 this needs a `-1` slot in `negOne`; 26.3+ ignores it. */
  negate(negOne?: Score, ctx?: FunctionContext): this {
    math`${this.score} * ${negOne ?? -1}`.into(this.score, ctx);
    return this;
  }

  /** Multiplies by a same-scale `other`, dividing the extra scale back out. */
  mul(other: Fixed, ctx?: FunctionContext): this {
    math`${this.score} * ${other.score} / ${this.scaleScore ?? this.scale}`.into(
      this.score,
      ctx,
    );
    return this;
  }

  /**
   * Divides by `divisor`, multiplying by the scale first so small results don't floor to
   * zero.
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
    math`${this.score} * ${k}`.into(this.score, ctx);
    return this;
  }

  /**
   * Divides by a unitless integer `k`; scale unchanged. A plain floor divide, for ratio
   * constants.
   */
  reduce(k: Score, ctx?: FunctionContext): this {
    math`${this.score} / ${k}`.into(this.score, ctx);
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
