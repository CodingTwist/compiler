// HAND-WRITTEN. Detectors: named, composable conditions.
//
// A detector appends guard clauses to an `execute` chain someone else finishes, so
// conditions
// can be passed around and combined into one command. Conditions are the costly part of a
// poll,
// so this lets whoever pays choose them. No latches or cadence here; those are
// spool/twine's.
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
 * Only guards and context shifts: no `run` or side effects, since detectors get combined
 * and
 * emitted at several sites. {@link detect} finishes the chain.
 *
 * ```ts
 * const pressed: Detector = (c) => c.ifBlock(pos, Block.STONE_BUTTON.state({ powered: true
 * }));
 * ```
 */
export type Detector = (chain: ExecuteBuilder) => void;

/** A registered predicate, an {@link Id}, or a raw id string. */
type PredicateLike = PredicateRef | Id | string;

/**
 * Emits `detector` and runs `hit` where it holds. With no clauses, `hit` is emitted bare.
 */
export function detect(
  ctx: FunctionContext,
  detector: Detector,
  hit: OnHit,
): void {
  const chain = ctx.execute();
  detector(chain);
  chain.runOrInline(hit);
}

/**
 * Built-in detectors and combinators. Any closure of the same shape works too.
 *
 * No `any`: a union can't merge into one chain and would run the body once per passing
 * branch.
 * Register two handlers instead.
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

  /** Always passes, adding no clauses. */
  always(): Detector {
    return () => {};
  },

  /**
   * Every detector must hold, in one chain.
   *
   * Order matters for cost: `execute` stops at the first failing clause, so put cheap,
   * usually-false checks first.
   */
  all(...detectors: Detector[]): Detector {
    return (c) => {
      for (const d of detectors) d(c);
    };
  },

  /** Evaluates `inner` in `dim`. */
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
   * Evaluates `inner` only while a player is within `radius` of `pos`, so empty rooms cost
   * one selector.
   */
  near(pos: Pos, radius: number, inner: Detector): Detector {
    return (c) => {
      // Built per emission because selectors change in place.
      c.positioned(pos).ifEntity(
        Selector.allPlayers().distance(new Range(undefined, radius)),
      );
      inner(c);
    };
  },
} as const;
