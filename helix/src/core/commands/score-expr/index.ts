// Score arithmetic for the `math` tag: the backend is chosen at codegen, once the version is known.
//
// 26.3+ uses one `/compute` command; older versions get a `scoreboard players operation` chain.
// Both compute the same integers for the portable ops. Compute-only ops (`sqrt`, trig,
// rounding, `pow`, `avg`, `len`), providers and fractional literals are a build error below 26.3.
// Registered via EXTRA_HANDLERS in scripts/gen-commands.mjs.
export { ScoreExprNode, emitScoreExpr } from "./node";
export { ScoreExprCommand } from "./handler";
export { toProvider, toFloatProvider } from "./provider";
export { toScoreOps } from "./score-ops";
