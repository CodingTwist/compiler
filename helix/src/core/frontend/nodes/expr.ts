import type { Score } from "./score";

/**
 * The integer expression tree both score backends can evaluate.
 *
 * It is deliberately the **intersection** of `scoreboard players operation` and
 * 26.3's `/compute`: `+ - * / %`, unary minus, `min`, `max`, `abs`. Anything
 * richer (`sqrt`, floats, `uniform`, storage leaves) has no pre-26.3 lowering at
 * all, so it stays on {@link ContextFloat}/{@link ContextInt} + `ctx.compute()`
 * and simply requires 26.3+. Two things with a line between them, not one leaky
 * abstraction.
 *
 * Semantics follow the **scoreboard**, since that is the side that cannot be
 * changed: `div` floors toward −∞ and `mod` is floor-modulo, so on the compute
 * side they lower to `floor_div`/`floor_mod`, not float division.
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
  | "neg";

export type ExprNode =
  | { kind: "lit"; value: number }
  | { kind: "score"; score: Score }
  | { kind: "op"; op: ExprOp; args: ExprNode[] };

export const litE = (value: number): ExprNode => ({ kind: "lit", value });
export const scoreE = (score: Score): ExprNode => ({ kind: "score", score });
export const opE = (op: ExprOp, ...args: ExprNode[]): ExprNode => ({
  kind: "op",
  op,
  args,
});
