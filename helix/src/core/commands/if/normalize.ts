// Flattens a condition tree into OR-of-AND `execute` clause chains, pushing `not` down to `unless`.
import { ExpressionNode } from "../../ir/node";
import { Score } from "../../frontend/nodes/score";
import type { Clause } from "../execute/types";
import { AndNode, ClausesNode, NotNode, OrNode, PredicateCheckNode, ScoreCompareNode, ScoreRangeNode } from "./nodes";

/** One `execute` chain's clauses; a condition is a list of these, any of which passes. */
export type Chain = Clause[];

// Shifts that always succeed once, so a negated guard can keep them.
const PURE_SHIFTS = new Set<Clause["k"]>(["in", "positioned", "rotated", "facing", "anchored", "align"]);

/** The chains `cond` passes on: none never passes, one empty chain always does. */
export function toChains(cond: ExpressionNode): Chain[] {
  if (cond instanceof ScoreRangeNode) {
    const score = new Score(cond.targetObjective, cond.target);
    return [[{ k: "scoreMatches", mode: "if", score, range: cond.range }]];
  }
  if (cond instanceof ScoreCompareNode) {
    const a = new Score(cond.targetObjective, cond.target);
    const b = new Score(cond.sourceObjective, cond.source);
    return [[{ k: "scoreCompare", mode: "if", a, op: cond.operator, b }]];
  }
  if (cond instanceof PredicateCheckNode) return [[{ k: "predicate", mode: "if", id: cond.predicateId }]];
  if (cond instanceof ClausesNode) return [cond.clauses];
  if (cond instanceof OrNode) return cond.conds.flatMap((c) => toChains(c as ExpressionNode));
  if (cond instanceof AndNode) return product(cond.conds.map((c) => toChains(c as ExpressionNode)));
  // not(a or b) = not a and not b.
  if (cond instanceof NotNode) return product(toChains(cond.cond as ExpressionNode).map(negate));
  throw new Error(`Unsupported condition: ${cond.type}`);
}

/** Every way to pick one chain from each list, joined. */
// ponytail: grows as the product of the OR sizes; fine for hand-written conditions.
function product(lists: Chain[][]): Chain[] {
  return lists.reduce<Chain[]>((acc, list) => acc.flatMap((a) => list.map((b) => join(a, b))), [[]]);
}

/** Both chains in one, with the one that moves position last so it can't move the other. */
function join(a: Chain, b: Chain): Chain {
  const moves = (c: Chain) => c.some((clause) => !("mode" in clause));
  if (!moves(a)) return [...a, ...b];
  if (!moves(b)) return [...b, ...a];
  throw new Error("and() can hold only one condition that changes position or executor");
}

/** The chains that pass exactly when `chain` fails: one per guard, flipped, under the shifts before it. */
function negate(chain: Chain): Chain[] {
  const shifts: Chain = [];
  const out: Chain[] = [];
  for (const c of chain) {
    if (PURE_SHIFTS.has(c.k)) shifts.push(c);
    else if ("mode" in c && (c.mode === "if" || c.mode === "unless")) {
      out.push([...shifts, { ...c, mode: c.mode === "if" ? "unless" : "if" } as Clause]);
    } else throw new Error(`not() can't negate a condition that uses \`${c.k}\``);
  }
  return out;
}
