import type { Score } from "./score";
import type {
  ContextFloatProvider,
  ContextIntProvider,
} from "../../values/context-provider";

/**
 * The expression tree both score backends can evaluate.
 *
 * The **portable** core is the intersection of `scoreboard players operation`
 * and 26.3's `/compute`: `+ - * / %`, unary minus, `min`, `max`, `abs` lower to
 * both backends on every supported version. Everything in
 * {@link COMPUTE_ONLY_OPS} - `sqrt`, trig, rounding, `pow`, `avg`, `len` - plus
 * every {@link ContextIntProvider}/{@link ContextFloatProvider} leaf and every
 * non-integer `lit` has no scoreboard lowering at all, so it **throws at
 * codegen** below 26.3 rather than being absent from the language. That's the
 * whole version story: a formula is a formula, and a pre-26.3 target is an
 * author error caught at build time.
 *
 * Nodes are **int-valued unless something makes them float** - one of three
 * things: a float op in {@link FLOAT_OPS}, a `ContextFloatProvider` leaf, or a
 * `lit` that isn't a whole number. Float-ness propagates up the tree and is
 * truncated exactly once, at the destination, so intermediate precision
 * survives (`sqrt(x) / 2` really halves the root).
 *
 * Integer semantics follow the **scoreboard**, since that is the side that
 * cannot be changed: `div` floors toward −∞ and `mod` is floor-modulo, so on
 * the compute side they lower to `floor_div`/`floor_mod`. Once an operand is
 * float there is no scoreboard to match, so they become real `div`/`mod`.
 *
 * Pure data - no version, no context, no emitting. Authors don't build it by
 * hand; the {@link math} tag parses infix source into it.
 */
export type ExprOp =
  | "add"
  | "sub"
  | "mul"
  | "div"
  | "mod"
  | "min"
  | "max"
  | "abs"
  | "neg"
  | ComputeOnlyOp;

/** Ops with no `scoreboard players operation` lowering: 26.3+ only. */
export const COMPUTE_ONLY_OPS = [
  "sqrt",
  "sin",
  "cos",
  "len",
  "round",
  "floor",
  "ceil",
  "pow",
  "avg",
] as const;
export type ComputeOnlyOp = (typeof COMPUTE_ONLY_OPS)[number];

/** Ops evaluated on `/compute`'s float side, whatever their operands are. */
export const FLOAT_OPS = [
  "sqrt",
  "sin",
  "cos",
  "len",
  "round",
  "floor",
  "ceil",
] as const;
export type FloatOp = (typeof FLOAT_OPS)[number];

const computeOnly: ReadonlySet<string> = new Set(COMPUTE_ONLY_OPS);
const floatOnly: ReadonlySet<string> = new Set(FLOAT_OPS);

export const isComputeOnly = (op: ExprOp): op is ComputeOnlyOp =>
  computeOnly.has(op);
export const isFloatOp = (op: ExprOp): op is FloatOp => floatOnly.has(op);

export type ExprNode =
  | { kind: "lit"; value: number }
  | { kind: "score"; score: Score }
  /** A raw `/compute` provider spliced in as a leaf - the escape hatch for `uniform`, `storage`, `conditional`. */
  | { kind: "provider"; provider: ContextIntProvider | ContextFloatProvider }
  | { kind: "op"; op: ExprOp; args: ExprNode[] };

export const litE = (value: number): ExprNode => ({ kind: "lit", value });
export const scoreE = (score: Score): ExprNode => ({ kind: "score", score });
export const providerE = (
  provider: ContextIntProvider | ContextFloatProvider,
): ExprNode => ({ kind: "provider", provider });
export const opE = (op: ExprOp, ...args: ExprNode[]): ExprNode => ({
  kind: "op",
  op,
  args,
});
