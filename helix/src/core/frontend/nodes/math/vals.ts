// Scalar/vector helpers: broadcasting ops per axis, dot products, and turning a hole into a value.
import { Score } from "../score";
import { ScoreVec3 } from "../score_vec3";
import { ExprNode, ExprOp, litE, opE, providerE, scoreE } from "../expr";
import { ContextFloatProvider, ContextIntProvider } from "../../../values/context-provider";
import { fail } from "./errors";
import { MathExpr } from "./math";
import type { Operand, Val } from "./types";

export const scalar = (e: ExprNode): Val => ({ vec: false, e });

export const map = (v: Val, f: (e: ExprNode) => ExprNode): Val =>
  v.vec
    ? { vec: true, e: v.e.map(f) as [ExprNode, ExprNode, ExprNode] }
    : scalar(f(v.e));

/** A variadic op over any mix of scalars and vectors, broadcasting per axis. */
export function nary(op: ExprOp, args: Val[]): Val {
  if (!args.some((a) => a.vec))
    return scalar(opE(op, ...args.map((a) => a.e as ExprNode)));
  return {
    vec: true,
    e: axes((idx) =>
      opE(op, ...args.map((a) => (a.vec ? a.e[idx] : (a.e as ExprNode)))),
    ),
  };
}

/** Per-axis when either side is a vector; vector-by-vector arithmetic is an error. */
export function zip(op: ExprOp, l: Val, r: Val, src: string, text: string): Val {
  if (!l.vec && !r.vec) return scalar(opE(op, l.e, r.e));
  if (l.vec && r.vec && op !== "add" && op !== "sub")
    fail(
      `\`${text}\` combines two vectors with \`${op}\` - use \`·\`/\`dot()\` for a dot product, or reduce one side to a scalar`,
      src,
    );
  const at = (v: Val, i: number) => (v.vec ? v.e[i] : v.e);
  return { vec: true, e: axes((i) => opE(op, at(l, i), at(r, i))) };
}

export function dot(l: Val, r: Val, src: string): Val {
  if (!l.vec || !r.vec) fail("`·`/`dot()` needs a vector on both sides", src);
  return scalar(opE("add", ...axes((i) => opE("mul", l.e[i], r.e[i]))));
}

export const axes = (f: (i: number) => ExprNode): [ExprNode, ExprNode, ExprNode] => [
  f(0),
  f(1),
  f(2),
];

export function operand(o: Operand | undefined, src: string): Val {
  if (typeof o === "number") return scalar(litE(o));
  if (o instanceof Score) return scalar(scoreE(o));
  if (o instanceof ScoreVec3)
    return { vec: true, e: axes((i) => scoreE(o.components[i])) };
  if (o instanceof MathExpr) return o.val;
  if (o instanceof ContextIntProvider || o instanceof ContextFloatProvider)
    return scalar(providerE(o));
  fail(
    `a \${} hole must be a number, Score, ScoreVec3, a /compute provider or another math\`\` expression (got ${typeof o})`,
    src,
  );
}
