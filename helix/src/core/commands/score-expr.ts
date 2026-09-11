// HAND-WRITTEN. The one place score arithmetic chooses its backend.
//
// A run of `scoreboard players operation` lines is a *chain of mutations* only
// because pre-26.3 there was nothing else: no expression could be written down,
// so every intermediate needed a real slot. 26.3's `/compute` takes the whole
// tree as one argument, which collapses the chain AND the scratch slots it
// needed. Both lowerings compute the same integers, so this is a pure backend
// swap - not a behaviour change and not something the author opts into.
//
// Principle 3: the version is only known at codegen, so the frontend emits ONE
// node carrying both spellings and this handler picks. The fallback is a thunk
// so a value only the old backend needs (Fixed's `scaleScore` slot) is demanded
// only when that backend is actually used.
//
// Registered via EXTRA_HANDLERS in scripts/gen-commands.mjs.
import { ASTNode } from "../ir/node";
import { CodegenContext, CommandHandler } from "../ir/commandhandler";
import { buildTokens, lit, arg } from "../ir/command-builder";
import { Score } from "../frontend/nodes/score";
import { ContextIntProvider } from "../values/context-provider";
import { supportsCommand } from "../../versions/capabilities";
import { currentContext } from "../frontend/context/ambient";
import type { FunctionContext } from "../frontend/context";

export class ScoreExprNode extends ASTNode {
  readonly type = "score-expr";
  constructor(
    /** The slot the expression's value lands in. */
    public readonly dest: Score,
    /** 26.3+ lowering: the whole formula as one `/compute` expression. */
    public readonly expr: ContextIntProvider,
    /** ≤26.2 lowering: the equivalent `scoreboard players operation` chain. */
    public readonly fallback: () => ASTNode[],
  ) {
    super();
  }
}

export class ScoreExprCommand extends CommandHandler<ScoreExprNode> {
  readonly type: ScoreExprNode["type"] = "score-expr";

  generate(node: ScoreExprNode, ctx: CodegenContext): void {
    if (!supportsCommand(ctx.version, ["compute"])) {
      for (const n of node.fallback()) ctx.dispatcher.dispatch(n, ctx);
      return;
    }
    ctx.emit(
      buildTokens(ctx.version, [
        lit("execute"),
        lit("store"),
        lit("result"),
        lit("score"),
        arg(node.dest.target.render(ctx.version)),
        arg(node.dest.objective.getName()),
        lit("run"),
        lit("compute"),
        lit("default"),
        lit("integer"),
        arg(node.expr.render(ctx.version)),
      ]),
    );
  }
}

/** Emit `dest = <expr>` into the ambient context (or `ctx`), backend chosen at codegen. */
export function emitScoreExpr(
  dest: Score,
  expr: ContextIntProvider,
  fallback: () => ASTNode[],
  ctx?: FunctionContext,
): void {
  const target = ctx ?? currentContext();
  if (!target)
    throw new Error(
      "Score arithmetic has no active context: call it inside a build()/run()/if() callback, or pass ctx explicitly.",
    );
  target.emit(new ScoreExprNode(dest, expr, fallback));
}
