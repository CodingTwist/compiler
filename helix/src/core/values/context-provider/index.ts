/**
 * `/compute` expressions (26.3+): a whole arithmetic tree evaluated in one command, with
 * floats and `sqrt`.
 *
 * ```ts
 * import { ContextFloat as f } from "helix";
 *
 * const speed = f.sqrt(f.add(f.mul(vx, vx), f.mul(vy, vy), f.mul(vz, vz)));
 * ctx.execute().storeResultScore(out).run((b) => b.compute().defaultFloat(speed, 100));
 * ```
 *
 * Int and float are separate namespaces because their ops differ; convert with
 * {@link ContextInt.fromFloat} / {@link ContextFloat.fromInt}.
 * Not the same as `NumberProvider` in loot-function.ts, a different registry.
 */
import { sharedOps } from "./shared";
import {
  ContextFloatProvider,
  ContextIntProvider,
  jsonOf,
  type FloatRef,
  type IntRef,
  type ProviderJson,
} from "./types";

export {
  ContextFloatProvider,
  ContextIntProvider,
  type FloatRef,
  type IntRef,
} from "./types";

const int = (json: ProviderJson) => new ContextIntProvider(json);
const float = (json: ProviderJson) => new ContextFloatProvider(json);

const intShared = sharedOps<ContextIntProvider, IntRef>(int);
const floatShared = sharedOps<ContextFloatProvider, FloatRef>(float);

/** Integer `/compute` expressions. Alias it: `import { ContextInt as i }`. */
export const ContextInt = {
  ...intShared,

  /** Divide rounding toward −∞. Right for coordinates. */
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

/** Float `/compute` expressions. Alias it: `import { ContextFloat as f }`. */
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
