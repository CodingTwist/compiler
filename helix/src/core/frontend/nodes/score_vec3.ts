import { Score } from "./score";
import type { FunctionContext } from "../context";

/**
 * Three scoreboard slots treated as a single vector, so vector algebra over scores
 * reads as algebra instead of three near-identical `scoreboard players operation`
 * lines per axis per step. Every method delegates to {@link Score}'s typed ops and
 * emits into the **ambient** context (the `build`/`run`/`if` callback you are
 * inside); pass `ctx` to override it, exactly like {@link Score}.
 *
 * It holds *references* to three existing `Score` slots and allocates nothing - the
 * caller owns where each component lives. That makes one class serve both roles a
 * score-vector takes: a **value** (three per-player objectives bound to a selector,
 * e.g. an anchor position) and a **scratch register** (three slots on a work
 * objective). Scores are integers, so {@link divide} floors toward −∞.
 *
 * Chainable like `Score`: `v.assign(a).sub(b).scale(k)`.
 */
export class ScoreVec3 {
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
  assign(other: ScoreVec3, ctx?: FunctionContext): this {
    this.x.assign(other.x, ctx);
    this.y.assign(other.y, ctx);
    this.z.assign(other.z, ctx);
    return this;
  }

  /** `this += other`. */
  add(other: ScoreVec3, ctx?: FunctionContext): this {
    this.x.plus(other.x, ctx);
    this.y.plus(other.y, ctx);
    this.z.plus(other.z, ctx);
    return this;
  }

  /** `this -= other`. */
  sub(other: ScoreVec3, ctx?: FunctionContext): this {
    this.x.minus(other.x, ctx);
    this.y.minus(other.y, ctx);
    this.z.minus(other.z, ctx);
    return this;
  }

  /** Scale every axis by the scalar score `k` (`*=`). */
  scale(k: Score, ctx?: FunctionContext): this {
    this.x.times(k, ctx);
    this.y.times(k, ctx);
    this.z.times(k, ctx);
    return this;
  }

  /** Divide every axis by the scalar score `k` (`/=`, integer floor). */
  divide(k: Score, ctx?: FunctionContext): this {
    this.x.divide(k, ctx);
    this.y.divide(k, ctx);
    this.z.divide(k, ctx);
    return this;
  }

  /** Clamp every axis into `[lo, hi]` (`< hi` then `> lo`). */
  clamp(lo: Score, hi: Score, ctx?: FunctionContext): this {
    this.x.min(hi, ctx).max(lo, ctx);
    this.y.min(hi, ctx).max(lo, ctx);
    this.z.min(hi, ctx).max(lo, ctx);
    return this;
  }

  /**
   * Dot product into `out`, using `scratch` for the cross terms - both
   * caller-owned scalar slots, distinct from this vector's components:
   *
   *   out = x·o.x + y·o.y + z·o.z
   */
  dot(
    other: ScoreVec3,
    out: Score,
    scratch: Score,
    ctx?: FunctionContext,
  ): Score {
    out.assign(this.x, ctx).times(other.x, ctx);
    scratch.assign(this.y, ctx).times(other.y, ctx);
    out.plus(scratch, ctx);
    scratch.assign(this.z, ctx).times(other.z, ctx);
    out.plus(scratch, ctx);
    return out;
  }

  /** Squared length `|v|² = v·v` (into `out`, via `scratch`). */
  lengthSquared(out: Score, scratch: Score, ctx?: FunctionContext): Score {
    return this.dot(this, out, scratch, ctx);
  }
}
