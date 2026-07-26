// HAND-WRITTEN. A detector: a *first-class, composable* condition.
//
// `ctx.execute().ifBlock(...).run(body)` already says "when this, do that", but it
// says it inline and once - the condition can't be named, passed to a helper, or
// swapped out by whoever is paying for it. That matters because a condition is the
// part of a poll with a per-tick price tag: `if block` is a chunk lookup, `if
// entity @a[...]` is a scan, `if predicate` is a datapack-side evaluation, and the
// author who wrote the *reward* is rarely the one who should be choosing among
// them.
//
// So a `Detector` is that expression reified: a function that appends its guard
// clauses to an `execute` chain someone else will terminate. Appending rather than
// emitting is what makes composition free - `all(near(...), block(...))` is one
// `execute positioned … if entity … if block … run …`, not a chain that runs a
// chain - so a caller can wrap a costly condition in a cheap one without paying
// for the wrapper.
//
// Mechanism, not policy: this file knows nothing about latches, one-shots or tick
// cadence. Those are `spool`/`twine`'s business, built on top of this.
import type { ExecuteBuilder } from "../commands/execute";
import { FunctionContext } from "./context";
import { Range } from "../ir/node";
import { Score } from "./nodes/score";
import { Selector } from "./nodes/selector";
import { Block, Id, Pos } from "../values";
import type { PredicateRef } from "../values/predicate";

/** What {@link detect} runs where the condition held. */
export type OnHit = (ctx: FunctionContext) => void;

/**
 * A condition, as clauses appended to an `execute` chain.
 *
 * A detector appends **only guards and context shifts** - never a `run`, never a
 * side effect - because callers compose them ({@link Detect.all}), nest them
 * under cheaper ones ({@link Detect.near}), and may emit the same one at several
 * sites. {@link detect} is what terminates the chain.
 *
 * Anything of this shape is a detector, including a closure you write, which is
 * the point: an API that *takes* a `Detector` has made its detection strategy an
 * argument rather than a decision, so whoever is paying the per-tick cost can
 * choose how it's paid.
 *
 * ```ts
 * const pressed: Detector = (c) => c.ifBlock(pos, Block.STONE_BUTTON.state({ powered: true }));
 * ```
 */
export type Detector = (chain: ExecuteBuilder) => void;

/** A registered predicate, an {@link Id}, or a raw id string. */
type PredicateLike = PredicateRef | Id | string;

/**
 * Emit `detector` into `ctx` and run `hit` where it held.
 *
 * A detector with no clauses at all ({@link Detect.always}, an empty
 * {@link Detect.all}) emits `hit` bare rather than a vacuous `execute run …`.
 */
export function detect(ctx: FunctionContext, detector: Detector, hit: OnHit): void {
  const chain = ctx.execute();
  detector(chain);
  chain.runOrInline(hit);
}

/**
 * The built-in detectors, plus the combinators for building bigger ones out of
 * smaller ones.
 *
 * Nothing here is privileged: every one is an ordinary {@link Detector}, so an
 * API that accepts one accepts a hand-written closure just the same. They exist
 * so the common conditions are spelled once and read the same everywhere - and so
 * the expensive ones can be wrapped in the cheap ones ({@link near}, {@link all})
 * rather than each being paid in full every tick.
 *
 * There is deliberately no `any`: a union of conditions can't merge into one
 * chain, so it would have to emit one guard per branch and fire the body once per
 * branch that passed - a different thing from a boolean `or`, and a sharp edge to
 * hand someone. Register two handlers instead.
 */
export const Detect = {
  /** `if block <pos> <block>` - the block at `pos` matches (id, state, or `#tag`). */
  block(pos: Pos, block: Block): Detector {
    return (c) => void c.ifBlock(pos, block);
  },

  /** `unless block <pos> <block>` - the block at `pos` does *not* match. */
  notBlock(pos: Pos, block: Block): Detector {
    return (c) => void c.unlessBlock(pos, block);
  },

  /** `if entity <sel>` - at least one entity matches. */
  entity(sel: Selector): Detector {
    return (c) => void c.ifEntity(sel);
  },

  /** `unless entity <sel>` - nothing matches. */
  noEntity(sel: Selector): Detector {
    return (c) => void c.unlessEntity(sel);
  },

  /** `if score <score> matches <range>`. */
  score(score: Score, range: Range): Detector {
    return (c) => void c.ifScoreMatches(score, range);
  },

  /** `unless score <score> matches <range>`. */
  notScore(score: Score, range: Range): Detector {
    return (c) => void c.unlessScoreMatches(score, range);
  },

  /** `if predicate <ref>` - hand the condition to a predicate JSON file. */
  predicate(ref: PredicateLike): Detector {
    return (c) => void c.ifPredicate(ref);
  },

  /** Always fires, adding no clauses. The identity of {@link all}. */
  always(): Detector {
    return () => {};
  },

  /**
   * Every detector must hold - appended left to right into one chain.
   *
   * **Order is the cost.** `execute` evaluates clauses in sequence and stops at
   * the first that fails, so put the cheap, usually-false test first:
   * `all(near(...), block(...))` pays a distance check most ticks and a chunk
   * read almost never, where `all(block(...), near(...))` pays both every tick
   * for the same answer.
   */
  all(...detectors: Detector[]): Detector {
    return (c) => {
      for (const d of detectors) d(c);
    };
  },

  /**
   * Evaluate what follows in `dim`, so a detector that reads the world names its
   * dimension once instead of at every site.
   */
  in(dim: Id, inner: Detector): Detector {
    return (c) => {
      c.in(dim);
      inner(c);
    };
  },

  /** Evaluate what follows positioned at `pos` (for `~`/`^`-relative conditions). */
  at(pos: Pos, inner: Detector): Detector {
    return (c) => {
      c.positioned(pos);
      inner(c);
    };
  },

  /**
   * Evaluate `inner` only while a player is within `radius` of `pos` - the
   * standard way to stop paying for a check nobody can observe.
   *
   * The distance test is a bounded `@a[distance=..r]`, cheap relative to what it
   * usually gates, and it comes first in the chain, so an empty room costs one
   * selector rather than the full condition.
   */
  near(pos: Pos, radius: number, inner: Detector): Detector {
    return (c) => {
      // The selector is built per emission, not shared: Selector builders mutate
      // in place, so one instance reused across sites is one anyone can change.
      c.positioned(pos).ifEntity(Selector.allPlayers().distance(new Range(undefined, radius)));
      inner(c);
    };
  },
} as const;
