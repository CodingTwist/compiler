// Rewrites a score expression over scaled slots (`score.scaled(1000)`) into stored integers.
import { Score } from "../../frontend/nodes/score";
import { ExprNode, litE, opE, scoreE } from "../../frontend/nodes/expr";

/** `n` as an integer when it is one, allowing for float error like `0.049 * 1000`. */
const whole = (n: number): number | undefined => {
  const r = Math.round(n);
  return Math.abs(n - r) < 1e-9 ? r : undefined;
};

/** Ops where every operand shares the result's unit, so a common scale passes straight through. */
const LINEAR = new Set(["add", "sub", "min", "max", "neg", "abs"]);

const hasScaled = (e: ExprNode): boolean =>
  (e.kind === "score" && e.score.scale !== 1) || (e.kind === "op" && e.args.some(hasScaled));

/** `e` at scale `k`, staying integer, or undefined when that needs real arithmetic. */
function exact(e: ExprNode, k: number): ExprNode | undefined {
  switch (e.kind) {
    case "lit":
    {
      const v = whole(e.value * k);
      return v === undefined ? undefined : litE(v);
    }
    case "score": {
      const ratio = whole(k / e.score.scale);
      return ratio === undefined ? undefined : opE("mul", scoreE(e.score.unscaled()), litE(ratio));
    }
    case "provider":
      return undefined;
    case "op": {
      if (e.op === "mul" && e.args.length === 2) {
        // A unitless integer factor, like `v * 2`.
        const [a, b] = e.args;
        const lit = [a, b].find((x) => x.kind === "lit" && Number.isInteger(x.value));
        const other = lit === a ? b : a;
        const scaled = lit && exact(other, k);
        return scaled && opE("mul", scaled, lit);
      }
      if (!LINEAR.has(e.op)) return undefined;
      const args = e.args.map((x) => exact(x, k));
      return args.every((x) => x) ? opE(e.op, ...(args as ExprNode[])) : undefined;
    }
  }
}

/** `e` with every scaled slot read as its real value. */
function real(e: ExprNode): ExprNode {
  if (e.kind === "score" && e.score.scale !== 1)
    return opE("mul", scoreE(e.score.unscaled()), litE(1 / e.score.scale));
  if (e.kind === "op") return opE(e.op, ...e.args.map(real));
  return e;
}

/**
 * The expression that stores `e`'s real value into `dest` at its scale. Unchanged when nothing
 * is scaled. Rounds rather than truncates, so float noise like 999.99994 doesn't lose a unit.
 */
export function toStoredUnits(dest: Score, e: ExprNode): ExprNode {
  const k = dest.scale;
  if (k === 1 && !hasScaled(e)) return e;
  const stored = exact(e, k);
  if (stored) return stored;
  return k === 1 ? real(e) : opE("round", opE("mul", real(e), litE(k)));
}
