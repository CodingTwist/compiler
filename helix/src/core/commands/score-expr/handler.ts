// Lowers a score expression: a short scoreboard chain when one exists, else one `/compute` on 26.3+.
import { CodegenContext, CommandHandler } from "../../ir/commandhandler";
import { buildTokens, lit, arg, raw } from "../../ir/command-builder";
import { hasCommandTree } from "../../ir/command-validator";
import { supportsCommand } from "../../../versions/capabilities";
import { VersionProfile } from "../../../versions/profile";
import { BrigadierNode } from "../../commandtree/tree";
import { ExprNode, isComputeOnly } from "../../frontend/nodes/expr";
import { unreadableHolder } from "../../values/context-provider/shared";
import { ScoreExprNode } from "./node";
import { toProvider } from "./provider";
import { toScoreOps } from "./score-ops";

/**
 * Longest scoreboard chain used instead of `/compute` on 26.3+.
 * Each `/compute` builds a loot context and goes through `execute store`, while an operation
 * is two score lookups.
 */
// ponytail: limit read off the 26.3 bytecode, not measured; raise it if helix-profiler shows longer chains still win.
const MAX_CHAIN = 2;

/**
 * `/compute` exists and the profile has a command tree.
 * Unlike {@link supportsCommand}, a stub profile answers false, so packs don't switch to a
 * command the target may lack.
 */
const hasCompute = (version: VersionProfile): boolean =>
  hasCommandTree(version.commands as BrigadierNode | undefined) &&
  supportsCommand(version, ["compute"]);

/** Whether any node in `e` passes `test`. */
const some = (e: ExprNode, test: (n: ExprNode) => boolean): boolean =>
  test(e) || (e.kind === "op" && e.args.some((a) => some(a, test)));

/** Whether `e` has something only `/compute` can express. */
const needsCompute = (e: ExprNode): boolean =>
  some(
    e,
    (n) =>
      n.kind === "provider" ||
      (n.kind === "lit" && !Number.isInteger(n.value)) ||
      (n.kind === "op" && isComputeOnly(n.op)),
  );

/** Whether `e` reads a score through a selector `/compute` can't resolve. */
const readsSelector = (e: ExprNode, version: VersionProfile): boolean =>
  some(
    e,
    (n) =>
      n.kind === "score" && unreadableHolder(n.score.target.render(version)),
  );

export class ScoreExprCommand extends CommandHandler<ScoreExprNode> {
  readonly type: ScoreExprNode["type"] = "score-expr";

  generate(node: ScoreExprNode, ctx: CodegenContext): void {
    const { dest, expr } = node;
    const version = ctx.version;
    // `toScoreOps` throws for compute-only ops, so it's only called when the chain is allowed.
    const forced = !hasCompute(version) || readsSelector(expr, version);
    const chain =
      forced || !needsCompute(expr) ? toScoreOps(dest, expr, version) : undefined;
    if (chain && (forced || chain.length <= MAX_CHAIN)) {
      for (const n of chain) ctx.dispatcher.dispatch(n, ctx);
      return;
    }
    // `compute` is validated alone; the `execute store … run` head is raw because the
    // data's redirects drop it.
    const compute = buildTokens(version, [
      lit("compute"),
      lit("default"),
      lit("integer"),
      arg(toProvider(expr).render(version)),
    ]);
    ctx.emit(
      buildTokens(version, [
        lit("execute"),
        raw(
          `store result score ${dest.target.render(version)} ` +
            `${dest.objective.getName()} run ${compute}`,
        ),
      ]),
    );
  }
}
