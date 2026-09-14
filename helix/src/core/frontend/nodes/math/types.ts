// What a `math` formula takes as holes, and what it parses to.
import { Score } from "../score";
import { ScoreVec3 } from "../score_vec3";
import { ExprNode } from "../expr";
import { ContextFloatProvider, ContextIntProvider } from "../../../values/context-provider";
import type { MathExpr } from "./math";

/** Anything that can be interpolated into a `math` formula. */
export type Operand =
  | number
  | Score
  | ScoreVec3
  | MathExpr
  | ContextIntProvider
  | ContextFloatProvider;

/** A parsed formula: either one integer expression or three (a vector). */
export type Val =
  | { vec: false; e: ExprNode }
  | { vec: true; e: [ExprNode, ExprNode, ExprNode] };
