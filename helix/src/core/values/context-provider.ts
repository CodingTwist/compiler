import { VersionProfile } from "../../versions/profile";
import { CommandValue } from "./value";
import { PredicateRef } from "./predicate";
import { Id } from "./id";
import { NbtPath } from "./nbt";
import type { Score } from "../frontend/nodes/score";

/**
 * `/compute`'s expression language (26.3+): the `minecraft:context_int_provider`
 * and `minecraft:context_float_provider` argument parsers.
 *
 * A provider is a whole arithmetic *tree* evaluated by the game in one command -
 * not a number and not a value source. That is what makes `/compute` different
 * in kind from `scoreboard players operation`: a formula is one command, with
 * real floats and `sqrt`, instead of a chain of mutating integer ops over
 * scratch holders.
 *
 * ```ts
 * import { ContextFloat as f } from "helix";
 *
 * const speed = f.sqrt(f.add(f.mul(vx, vx), f.mul(vy, vy), f.mul(vz, vz)));
 * ctx.execute().storeResultScore(out).run((b) => b.compute().defaultFloat(speed, 100));
 * ```
 *
 * **Int and float are separate languages**, deliberately kept as separate
 * namespaces rather than one generic builder: `sqrt`/`sin`/`cos`/`length` exist
 * only on float, `floor_div`/`floor_mod`/`binomial` only on int, and
 * {@link ContextInt.fromFloat} / {@link ContextFloat.fromInt} are the explicit
 * crossings. A shared builder would have to be either a union of every op or a
 * runtime check.
 *
 * NOT to be confused with `NumberProvider` in loot-function.ts. That is the
 * `int_provider_type` registry (`clamped`, `trapezoid`, `biased_to_bottom`, …) -
 * a *sibling* registry with a different vocabulary, unrelated to this one.
 */

/** Deferred JSON: a provider's shape can depend on the target version, like {@link PredicateRef}. */
type ProviderJson = (version: VersionProfile) => unknown;

abstract class ProviderBase implements CommandValue {
  constructor(readonly toJson: ProviderJson) {}

  /** The whole tree as one command token. Rendered compactly - it goes on a command line. */
  render(version: VersionProfile): string {
    return JSON.stringify(this.toJson(version));
  }
}

/** An integer-valued `/compute` expression (`minecraft:context_int_provider`). */
export class ContextIntProvider extends ProviderBase {
  // Nominal brand: without it int and float providers are structurally identical
  // and the compiler would happily let you pass one where the other belongs.
  private declare readonly __int: void;
}

/** A float-valued `/compute` expression (`minecraft:context_float_provider`). */
export class ContextFloatProvider extends ProviderBase {
  private declare readonly __float: void;
}

/** Anywhere an int operand is accepted: a bare number is a constant. */
export type IntRef = number | ContextIntProvider;
/** Anywhere a float operand is accepted: a bare number is a constant. */
export type FloatRef = number | ContextFloatProvider;

const jsonOf = (x: number | ProviderBase): ProviderJson =>
  typeof x === "number" ? () => x : x.toJson;

/** The ops both languages share, built once and specialised by `wrap`. */
function sharedOps<P extends ProviderBase, R extends number | P>(
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
      wrap((v) => ({ type: "pow", base: jsonOf(base)(v), exponent: jsonOf(exponent)(v) })),

    /** A uniform random draw in `[min, max]` - a real roll, evaluated by the game. */
    uniform: (min: R, max: R): P =>
      wrap((v) => ({ type: "uniform", min: jsonOf(min)(v), max: jsonOf(max)(v) })),

    /** Pick `onTrue` or `onFalse` (default `0`) by a predicate. */
    conditional: (condition: PredicateRef | Id | string, onTrue: R, onFalse?: R): P =>
      wrap((v) => ({
        type: "conditional",
        condition: predicateId(condition),
        on_true: jsonOf(onTrue)(v),
        ...(onFalse === undefined ? {} : { on_false: jsonOf(onFalse)(v) }),
      })),

    /**
     * Read a scoreboard value straight into the expression - the leaf that makes
     * `/compute` a replacement for score arithmetic rather than a sibling of it.
     */
    score: (score: Score, fallback?: R): P =>
      wrap((v) => ({
        type: "score",
        target: { type: "fixed", name: score.target.render(v) },
        score: score.objective.getName(),
        ...(fallback === undefined ? {} : { fallback: jsonOf(fallback)(v) }),
      })),

    /** Read a number out of command storage. */
    storage: (storage: Id | string, path: NbtPath | string, fallback?: R): P =>
      wrap((v) => ({
        type: "storage",
        storage: typeof storage === "string" ? Id(storage).render() : storage.render(),
        path: typeof path === "string" ? path : path.render(),
        ...(fallback === undefined ? {} : { fallback: jsonOf(fallback)(v) }),
      })),

    /**
     * Escape hatch for a provider this API doesn't model yet (`number_dispatcher`,
     * `weighted_list`, `environment_attribute`, `enchantment_level`) or a named
     * provider referenced by id. Same stance as `ItemModel.raw()`.
     */
    raw: (json: unknown): P => wrap(() => json),
  };
}

const predicateId = (p: PredicateRef | Id | string): string =>
  typeof p === "string" ? Id(p).render() : p instanceof PredicateRef ? p.id : p.render();

const int = (json: ProviderJson) => new ContextIntProvider(json);
const float = (json: ProviderJson) => new ContextFloatProvider(json);

const intShared = sharedOps<ContextIntProvider, IntRef>(int);
const floatShared = sharedOps<ContextFloatProvider, FloatRef>(float);

/** Integer `/compute` expressions. Alias it short at the call site: `import { ContextInt as i }`. */
export const ContextInt = {
  ...intShared,

  /** Floored divide - rounds toward `-∞`. What you want for coordinates. */
  floorDiv: intShared.bin("floor_div"),
  /** Floored modulo - the partner of {@link floorDiv}; `floorMod(-5, 2)` is `1`, not `-1`. */
  floorMod: intShared.bin("floor_mod"),

  /** `n` coin flips at probability `p`, counting successes. */
  binomial: (n: IntRef, p: FloatRef): ContextIntProvider =>
    int((v) => ({ type: "binomial", n: jsonOf(n)(v), p: jsonOf(p)(v) })),

  /** Truncate a float expression to an int (rounds toward `0`). */
  fromFloat: (input: FloatRef): ContextIntProvider =>
    int((v) => ({ type: "from_float", input: jsonOf(input)(v) })),
};

/** Float `/compute` expressions. Alias it short at the call site: `import { ContextFloat as f }`. */
export const ContextFloat = {
  ...floatShared,

  /** The reason `/compute` changes what a datapack can express: real square roots. */
  sqrt: floatShared.un("sqrt"),
  sin: floatShared.un("sin"),
  cos: floatShared.un("cos"),

  ceil: floatShared.un("ceil"),
  floor: floatShared.un("floor"),
  round: floatShared.un("round"),
  truncate: floatShared.un("truncate"),

  /** Euclidean length of the inputs treated as a vector - `sqrt(Σ xᵢ²)` in one node. */
  length: floatShared.agg("length"),

  /** Widen an int expression to a float. */
  fromInt: (input: IntRef): ContextFloatProvider =>
    float((v) => ({ type: "from_int", input: jsonOf(input)(v) })),
};
