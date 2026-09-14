// Lowers a score expression: one `/compute` on 26.3+, a scoreboard operation chain before.
import { ASTNode } from "../../ir/node";
import { CodegenContext, CommandHandler } from "../../ir/commandhandler";
import { buildTokens, lit, arg, raw } from "../../ir/command-builder";
import { hasCommandTree } from "../../ir/command-validator";
import { supportsCommand } from "../../../versions/capabilities";
import { VersionProfile } from "../../../versions/profile";
import { BrigadierNode } from "../../commandtree/tree";
import { Score } from "../../frontend/nodes/score";
import { ExprNode } from "../../frontend/nodes/expr";
import { scoreLitNode } from "../scoreboard";
import { ScoreExprNode } from "./node";
import { toProvider } from "./provider";
import { toScoreOps } from "./score-ops";

/**
 * `/compute` exists and the profile has a command tree.
 * Unlike {@link supportsCommand}, a stub profile answers false, so packs don't switch to a
 * command the target may lack.
 */
const hasCompute = (version: VersionProfile): boolean =>
  hasCommandTree(version.commands as BrigadierNode | undefined) &&
  supportsCommand(version, ["compute"]);

/**
 * `dest = dest ± <literal>` (either operand order for `add`), the one shape
 * `scoreboard players operation` does for free. Caught before `/compute` so a compile-time
 * constant offset - the common case - never pays for a full expression tree, on any version.
 */
function selfIncrement(dest: Score, expr: ExprNode, version: VersionProfile): ASTNode | undefined {
  if (expr.kind !== "op" || (expr.op !== "add" && expr.op !== "sub") || expr.args.length !== 2)
    return undefined;
  const [a, b] = expr.args;
  const key = (s: Score) => `${s.target.render(version)} ${s.objective.getName()}`;
  const isDest = (n: ExprNode) => n.kind === "score" && key(n.score) === key(dest);
  const litOf = (n: ExprNode) => (n.kind === "lit" && Number.isInteger(n.value) ? n.value : undefined);

  let value: number | undefined;
  if (isDest(a)) value = litOf(b);
  else if (expr.op === "add" && isDest(b)) value = litOf(a);
  if (value === undefined) return undefined;

  const v = expr.op === "add" ? value : -value;
  return scoreLitNode(v < 0 ? "remove" : "add", dest, Math.abs(v));
}

export class ScoreExprCommand extends CommandHandler<ScoreExprNode> {
  readonly type: ScoreExprNode["type"] = "score-expr";

  generate(node: ScoreExprNode, ctx: CodegenContext): void {
    const peephole = selfIncrement(node.dest, node.expr, ctx.version);
    if (peephole) {
      ctx.dispatcher.dispatch(peephole, ctx);
      return;
    }
    if (!hasCompute(ctx.version)) {
      for (const n of toScoreOps(node.dest, node.expr, ctx.version))
        ctx.dispatcher.dispatch(n, ctx);
      return;
    }
    // `compute` is validated alone; the `execute store … run` head is raw because the
    // data's redirects drop it.
    const compute = buildTokens(ctx.version, [
      lit("compute"),
      lit("default"),
      lit("integer"),
      arg(toProvider(node.expr).render(ctx.version)),
    ]);
    ctx.emit(
      buildTokens(ctx.version, [
        lit("execute"),
        raw(
          `store result score ${node.dest.target.render(ctx.version)} ` +
            `${node.dest.objective.getName()} run ${compute}`,
        ),
      ]),
    );
  }
}
