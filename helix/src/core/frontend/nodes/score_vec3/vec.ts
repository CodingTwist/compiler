// `ScoreVec3`: three score slots used as one vector, with NBT reads and writes.
import { Score } from "../score";
import { currentContext } from "../../context/ambient";
import type { FunctionContext } from "../../context";
import type { Selector } from "../selector";
import type { NbtPath } from "../../../values/nbt";
import type { Id } from "../../../values/id";
// Type-only, to avoid the import cycle (see CLAUDE.md).
import type { StoreNumType } from "../../../commands/execute";
import { ScoreVec3Ops } from "./ops";

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
export class ScoreVec3 extends ScoreVec3Ops {
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

  /** This vector holding `scale` units per real unit; see {@link Score.scaled}. */
  scaled(scale: number): ScoreVec3 {
    return new ScoreVec3(this.x.scaled(scale), this.y.scaled(scale), this.z.scaled(scale));
  }

  /**
   * Reads a 3-element NBT list on `who` into this vector, scaled to integers:
   *
   *   v.readEntity(target, Path.Entity.Pos, 100)   // centi-blocks
   */
  readEntity(
    who: Selector,
    path: NbtPath,
    scaleOrOpts?: number | ScoreVec3NbtOptions,
    maybeOpts?: ScoreVec3NbtOptions,
  ): this {
    const [scale, opts] = split(scaleOrOpts, maybeOpts, this.x.scale);
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
   * Reads a 3-element NBT list in `storage` into this vector, scaled to integers:
   *
   *   v.readStorage(Id("ns:temp"), NbtPath("vec_k"), 100000)
   */
  readStorage(
    storage: Id,
    path: NbtPath,
    scaleOrOpts?: number | ScoreVec3NbtOptions,
    maybeOpts?: ScoreVec3NbtOptions,
  ): this {
    const [scale, opts] = split(scaleOrOpts, maybeOpts, this.x.scale);
    const ctx = emitInto(opts.ctx);
    this.components.forEach((score, axis) => {
      const chain = ctx.execute();
      if (opts.at) chain.at(opts.at);
      chain
        .storeResultScore(score)
        .run((c) => c.storage(storage).get(path.index(axis), scale));
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
    scaleOrOpts?: number | ScoreVec3NbtOptions,
    maybeOpts?: ScoreVec3NbtOptions,
  ): this {
    const [scale, opts] = split(scaleOrOpts, maybeOpts, 1 / this.x.scale);
    const ctx = emitInto(opts.ctx);
    this.components.forEach((score, axis) => {
      const chain = ctx.execute();
      if (opts.at) chain.at(opts.at);
      chain
        .storeResultEntity(who, path.index(axis), type, scale)
        .run((c) => score.get(c));
    });
    return this;
  }
}

/** An NBT read/write's scale and options, the scale defaulting to the vector's own. */
function split(
  scaleOrOpts: number | ScoreVec3NbtOptions | undefined,
  opts: ScoreVec3NbtOptions | undefined,
  fallback: number,
): [number, ScoreVec3NbtOptions] {
  return typeof scaleOrOpts === "number" ? [scaleOrOpts, opts ?? {}] : [fallback, scaleOrOpts ?? {}];
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
