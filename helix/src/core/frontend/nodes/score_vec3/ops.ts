// Per-axis arithmetic on three score slots.
import { Score } from "../score";
import { opE, scoreE, type ExprOp } from "../expr";
import { emitScoreExpr } from "../../../commands/score-expr";
import { clampScore } from "../fixed";
import type { FunctionContext } from "../../context";

/** The arithmetic half of {@link ScoreVec3}: assign, add, scale, dot and friends. */
export class ScoreVec3Ops {
  constructor(
    public readonly x: Score,
    public readonly y: Score,
    public readonly z: Score,
  ) {}

  /** The three components as a tuple (e.g. for `store result score` reads). */
  get components(): readonly [Score, Score, Score] {
    return [this.x, this.y, this.z];
  }

  /** `this = other` (component-wise `=`). */
  assign(other: ScoreVec3Ops, ctx?: FunctionContext): this {
    this.x.assign(other.x, ctx);
    this.y.assign(other.y, ctx);
    this.z.assign(other.z, ctx);
    return this;
  }

  /** Per axis, `dest = f(dest, operand)` as one expression. */
  protected each(
    op: ExprOp,
    rhs: (axis: 0 | 1 | 2) => Score,
    ctx?: FunctionContext,
  ): this {
    this.components.forEach((c, axis) =>
      emitScoreExpr(c, opE(op, scoreE(c), scoreE(rhs(axis as 0 | 1 | 2))), ctx),
    );
    return this;
  }

  /** `this += other`. */
  add(other: ScoreVec3Ops, ctx?: FunctionContext): this {
    return this.each("add", (axis) => other.components[axis], ctx);
  }

  /** `this -= other`. */
  sub(other: ScoreVec3Ops, ctx?: FunctionContext): this {
    return this.each("sub", (axis) => other.components[axis], ctx);
  }

  /** Scale every axis by the scalar score `k` (`*=`). */
  scale(k: Score, ctx?: FunctionContext): this {
    return this.each("mul", () => k, ctx);
  }

  /** Divide every axis by the scalar score `k` (`/=`, integer floor). */
  divide(k: Score, ctx?: FunctionContext): this {
    return this.each("div", () => k, ctx);
  }

  /** Clamp every axis into `[lo, hi]` (`< hi` then `> lo`). */
  clamp(lo: Score, hi: Score, ctx?: FunctionContext): this {
    for (const c of this.components) clampScore(c, lo, hi, ctx);
    return this;
  }

  /**
   * Dot product into `out`, as one expression. Uses an internal temp, so no scratch slot
   * needed.
   */
  dot(other: ScoreVec3Ops, out: Score, ctx?: FunctionContext): Score {
    emitScoreExpr(
      out,
      opE(
        "add",
        ...this.components.map((c, axis) =>
          opE("mul", scoreE(c), scoreE(other.components[axis])),
        ),
      ),
      ctx,
    );
    return out;
  }

  /** Squared length `|v|² = v·v` (into `out`). */
  lengthSquared(out: Score, ctx?: FunctionContext): Score {
    return this.dot(this, out, ctx);
  }
}
