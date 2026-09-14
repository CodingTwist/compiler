// Lowers a score expression: one `/compute` on 26.3+, a scoreboard operation chain before.
import { CodegenContext, CommandHandler } from "../../ir/commandhandler";
import { buildTokens, lit, arg, raw } from "../../ir/command-builder";
import { hasCommandTree } from "../../ir/command-validator";
import { supportsCommand } from "../../../versions/capabilities";
import { VersionProfile } from "../../../versions/profile";
import { BrigadierNode } from "../../commandtree/tree";
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

export class ScoreExprCommand extends CommandHandler<ScoreExprNode> {
  readonly type: ScoreExprNode["type"] = "score-expr";

  generate(node: ScoreExprNode, ctx: CodegenContext): void {
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
