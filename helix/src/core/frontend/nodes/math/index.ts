// Score maths as a formula: math`${a} + min(${b}, 10)`.into(dest).
//
// Parsed with jsep, then lowered by commands/score-expr to one `/compute` on 26.3+ or a
// scoreboard chain before.
export { math, MathExpr } from "./math";
export type { Operand } from "./types";
