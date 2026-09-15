// The `/compute` ops the int and float languages share.
import { PredicateRef } from "../predicate";
import { Id } from "../id";
import { NbtPath } from "../nbt";
import type { Score } from "../../frontend/nodes/score";
import { jsonOf, type ProviderBase, type ProviderJson } from "./types";

/** Whether a rendered score holder is a selector `/compute` can't read (anything but `@s`). */
export const unreadableHolder = (holder: string): boolean =>
  holder.startsWith("@") && holder !== "@s";

/** The `score` provider's `target` for a rendered holder. */
function scoreHolderJson(holder: string): unknown {
  if (holder === "@s") return { type: "context", target: "this" };
  if (unreadableHolder(holder))
    throw new Error(
      `/compute can't read the score of \`${holder}\`: it only reads fake players and @s. ` +
        `Run it under \`execute as ${holder}\` and read @s, or copy the score to a fake player first.`,
    );
  return { type: "fixed", name: holder };
}

/** The ops both languages share, built once and specialised by `wrap`. */
export function sharedOps<P extends ProviderBase, R extends number | P>(
  wrap: (json: ProviderJson) => P,
) {
  const agg =
    (type: string) =>
    (...inputs: R[]): P =>
      wrap((v) => ({ type, inputs: inputs.map((i) => jsonOf(i)(v)) }));
  const bin =
    (type: string) =>
    (left: R, right: R): P =>
      wrap((v) => ({ type, left: jsonOf(left)(v), right: jsonOf(right)(v) }));
  const un =
    (type: string) =>
    (input: R): P =>
      wrap((v) => ({ type, input: jsonOf(input)(v) }));

  return {
    agg,
    bin,
    un,

    /** `a + b + …` */
    add: agg("add"),
    /** `a * b * …` */
    mul: agg("mul"),
    /** Arithmetic mean. */
    avg: agg("avg"),
    max: agg("max"),
    min: agg("min"),

    /** `left - right` */
    sub: bin("sub"),
    /** `left / right` */
    div: bin("div"),
    /** `left % right` (truncated division; see {@link ContextInt.floorMod}). */
    mod: bin("mod"),

    abs: un("abs"),
    negate: un("negate"),

    /** `base ** exponent`. */
    pow: (base: R, exponent: R): P =>
      wrap((v) => ({
        type: "pow",
        base: jsonOf(base)(v),
        exponent: jsonOf(exponent)(v),
      })),

    /** A uniform random draw in `[min, max]` - a real roll, evaluated by the game. */
    uniform: (min: R, max: R): P =>
      wrap((v) => ({
        type: "uniform",
        min: jsonOf(min)(v),
        max: jsonOf(max)(v),
      })),

    /** Pick `onTrue` or `onFalse` (default `0`) by a predicate. */
    conditional: (
      condition: PredicateRef | Id | string,
      onTrue: R,
      onFalse?: R,
    ): P =>
      wrap((v) => ({
        type: "conditional",
        condition: predicateId(condition),
        on_true: jsonOf(onTrue)(v),
        ...(onFalse === undefined ? {} : { on_false: jsonOf(onFalse)(v) }),
      })),

    /**
     * Reads a score into the expression. The holder must be a fake player or `@s`.
     * A `fixed` name is taken literally, so `@s` has to go through `context` and other
     * selectors can't be read at all.
     */
    score: (score: Score, fallback?: R): P =>
      wrap((v) => ({
        type: "score",
        target: scoreHolderJson(score.target.render(v)),
        score: score.objective.getName(),
        ...(fallback === undefined ? {} : { fallback: jsonOf(fallback)(v) }),
      })),

    /** Read a number out of command storage. */
    storage: (storage: Id | string, path: NbtPath | string, fallback?: R): P =>
      wrap((v) => ({
        type: "storage",
        storage:
          typeof storage === "string" ? Id(storage).render() : storage.render(),
        path: typeof path === "string" ? path : path.render(),
        ...(fallback === undefined ? {} : { fallback: jsonOf(fallback)(v) }),
      })),

    /** Escape hatch for providers not modelled yet, or one referenced by id. */
    raw: (json: unknown): P => wrap(() => json),
  };
}

const predicateId = (p: PredicateRef | Id | string): string =>
  typeof p === "string"
    ? Id(p).render()
    : p instanceof PredicateRef
      ? p.id
      : p.render();
