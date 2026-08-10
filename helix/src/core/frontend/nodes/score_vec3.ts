import { Score } from "./score";
import { currentContext } from "../context/ambient";
import type { FunctionContext } from "../context";
import type { Selector } from "./selector";
import type { NbtPath } from "../../values/nbt";
// Type-only: the `execute` chain reaches this class through the ambient
// `FunctionContext` augmentation, never through a value import (see the
// import-cycle rule in CLAUDE.md).
import type { StoreNumType } from "../../commands/execute";

/** Axis names, in component order. */
const AXES = ["x", "y", "z"] as const;

/** Where a vector's NBT read/write emits, and from which position. */
export interface ScoreVec3NbtOptions {
  /**
   * Prefix the chain with `at <sel>`, so the entity selector resolves (and any
   * `limit=1` sorts) from there. It has to live on the *same* execute chain as
   * the `store`, which is why it is an option here rather than a wrapping
   * `execute().at(...).run(...)` - that would spill three commands into a
   * generated child function.
   */
  readonly at?: Selector;
  /** Emit here instead of the ambient context, exactly like {@link Score}. */
  readonly ctx?: FunctionContext;
}

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

  /**
   * Build a vector from a per-axis score, so no caller has to spell x/y/z out:
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

  /**
   * Read a 3-element numeric NBT list on `who` into this vector's slots, `scale`d
   * into integers - the bridge between world state and score arithmetic:
   *
   *   v.readEntity(target, Path.Entity.Pos, 100)   // centi-blocks
   *
   * emits one `execute [at …] store result score <axis> run data get entity <who>
   * <path>[i] <scale>` per axis. `path` is indexed through {@link NbtPath.index},
   * so the list layout stays a path concept.
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
   * The inverse of {@link readEntity}: write this vector into a 3-element numeric
   * NBT list on `who`, `scale`d back into the fractional value the field wants:
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
 * The context a vector's NBT read/write emits into. Unlike the pure score ops it
 * needs the *full* `FunctionContext` (it builds an `execute` chain), which the
 * ambient stack only types as an emitter - hence the narrowing.
 */
function emitInto(ctx?: FunctionContext): FunctionContext {
  const target = ctx ?? (currentContext() as FunctionContext | undefined);
  if (!target)
    throw new Error(
      "ScoreVec3: no active function context - pass `{ ctx }` when emitting outside a builder callback.",
    );
  return target;
}
