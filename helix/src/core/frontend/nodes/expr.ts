import type { Score } from "./score";
import type {
  ContextFloatProvider,
  ContextIntProvider,
} from "../../values/context-provider";

/**
 * The score expression tree.
 *
 * Portable ops (`+ - * / %`, negate, `min`, `max`, `abs`) work on every version.
 * Compute-only ops
 * (`sqrt`, trig, rounding, `pow`, `avg`, `len`), providers and fractional literals throw at
 * codegen
 * below 26.3.
 *
 * Values are ints unless a float op, float provider or fractional literal makes them float.
 * Float-ness propagates up and truncates once at the destination.
 *
 * Integer `div` and `mod` floor like the scoreboard does. Built by the {@link math} tag,
 * not by hand.
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
/** An op node, with `x + 0`, `x - 0` and `x * 1` dropped since each would emit a no-op command. */
export const opE = (op: ExprOp, ...args: ExprNode[]): ExprNode => {
  const isLit = (e: ExprNode, v: number) => e.kind === "lit" && e.value === v;
  if (args.length === 2) {
    const [a, b] = args;
    if ((op === "add" || op === "sub") && isLit(b, 0)) return a;
    if (op === "add" && isLit(a, 0)) return b;
    if (op === "mul" && isLit(b, 1)) return a;
    if (op === "mul" && isLit(a, 1)) return b;
  }
  return { kind: "op", op, args };
};
