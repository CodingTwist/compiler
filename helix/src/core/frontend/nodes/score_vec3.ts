import { Score } from "./score";
import { opE, scoreE, type ExprOp } from "./expr";
import { emitScoreExpr } from "../../commands/score-expr";
import { clampScore } from "./fixed";
import { currentContext } from "../context/ambient";
import type { FunctionContext } from "../context";
import type { Selector } from "./selector";
import type { NbtPath } from "../../values/nbt";
// Type-only, to avoid the import cycle (see CLAUDE.md).
import type { StoreNumType } from "../../commands/execute";

/** Axis names, in component order. */
const AXES = ["x", "y", "z"] as const;

/** Where a vector's NBT read/write emits, and from which position. */
export interface ScoreVec3NbtOptions {
  /**
   * Prefix with `at <sel>` so the selector resolves from there.
   * An option rather than a wrapper so it stays on the same `execute` as the `store`.
   */
  readonly at?: Selector;
  /** Emit here instead of the ambient context, exactly like {@link Score}. */
  readonly ctx?: FunctionContext;
}

/**
 * Three score slots used as one vector, so vector maths reads as maths.
 *
 * Arithmetic lowers per axis to `/compute` or `operation`. Holds references to existing
 * slots,
 * emits into the ambient context (or `ctx`), and chains: `v.assign(a).sub(b).scale(k)`.
 * Division floors toward −∞.
 */
export class ScoreVec3 {
  constructor(
    public readonly x: Score,
    public readonly y: Score,
    public readonly z: Score,
  ) {}

  /**
   * Builds a vector from a per-axis score:
   *
   *   ScoreVec3.from((axis) => work.score(ScoreTarget(`#v${axis}`)))
   *   ScoreVec3.from((_, i) => objectives[i].score(self()))
   */
  static from(
    of: (axis: (typeof AXES)[number], index: number) => Score,
  ): ScoreVec3 {
    return new ScoreVec3(of("x", 0), of("y", 1), of("z", 2));
  }

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

  /** Per axis, `dest = f(dest, operand)` as one expression. */
  private each(
    op: ExprOp,
    rhs: (axis: 0 | 1 | 2) => Score,
    ctx?: FunctionContext,
  ): this {
    this.components.forEach((c, axis) =>
      emitScoreExpr(
        c,
        opE(op, scoreE(c), scoreE(rhs(axis as 0 | 1 | 2))),
        ctx,
      ),
    );
    return this;
  }

  /** `this += other`. */
  add(other: ScoreVec3, ctx?: FunctionContext): this {
    return this.each("add", (axis) => other.components[axis], ctx);
  }

  /** `this -= other`. */
  sub(other: ScoreVec3, ctx?: FunctionContext): this {
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
  dot(other: ScoreVec3, out: Score, ctx?: FunctionContext): Score {
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

  /**
   * Reads a 3-element NBT list on `who` into this vector, scaled to integers:
   *
   *   v.readEntity(target, Path.Entity.Pos, 100)   // centi-blocks
   */
  readEntity(
    who: Selector,
    path: NbtPath,
    scale: number,
    opts: ScoreVec3NbtOptions = {},
  ): this {
    const ctx = emitInto(opts.ctx);
    this.components.forEach((score, axis) => {
      const chain = ctx.execute();
      if (opts.at) chain.at(opts.at);
      chain
        .storeResultScore(score)
        .run((c) => c.entity(who).get(path.index(axis), scale));
    });
    return this;
  }

  /**
   * Writes this vector into a 3-element NBT list on `who`, scaled back to fractions:
   *
   *   v.storeEntity(shot, Path.Entity.Motion, "double", 1 / 10000)
   */
  storeEntity(
    who: Selector,
    path: NbtPath,
    type: StoreNumType,
    scale: number,
    opts: ScoreVec3NbtOptions = {},
  ): this {
    const ctx = emitInto(opts.ctx);
    this.components.forEach((score, axis) => {
      const chain = ctx.execute();
      if (opts.at) chain.at(opts.at);
      chain
        .storeResultEntity(who, path.index(axis), type, scale)
        .run((c) => c.scoreGet(score));
    });
    return this;
  }
}

/**
 * The context for NBT reads and writes, narrowed to `FunctionContext` since they build
 * `execute` chains.
 */
function emitInto(ctx?: FunctionContext): FunctionContext {
  const target = ctx ?? (currentContext() as FunctionContext | undefined);
  if (!target)
    throw new Error(
      "ScoreVec3: no active function context - pass `{ ctx }` when emitting outside a builder callback.",
    );
  return target;
}
