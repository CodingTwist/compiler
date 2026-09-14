// `ctx.if(condition, then).elif(...).else(...)`: score/predicate control flow.
//
// Also home to the score condition nodes (`ScoreRangeNode`, `ScoreCompareNode`) that have no
// command of their own. Nested guards fold into one `execute … if … if … run` line.
export * from "./nodes";
export * from "./handler";
// Must be `export *`: it carries the `ctx.if()` augmentation, which consumers only see through the barrel.
export * from "./method";
