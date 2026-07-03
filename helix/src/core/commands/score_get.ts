// HAND-WRITTEN. `scoreboard players get <target> <objective>` - reads a score,
// typically as the run target of an `execute store …`. Registered via
// EXTRA_HANDLERS in scripts/gen-commands.mjs.
import { ASTNode } from "../ir/node";
import { Score } from "../frontend/nodes/score";
import { CodegenContext, CommandHandler } from "../ir/commandhandler";
import { arg, buildTokens, lit } from "../ir/command-builder";
import { FunctionContext } from "../frontend/context";
import { toCommandValue } from "../values/value";

export class ScoreGetNode extends ASTNode {
  type = "score_get";
  constructor(public score: Score) {
    super();
  }
}

export class ScoreGetCommand extends CommandHandler<ScoreGetNode> {
  generate(node: ScoreGetNode, ctx: CodegenContext): void {
    ctx.emit(
      buildTokens(ctx.version, [
        lit("scoreboard"),
        lit("players"),
        lit("get"),
        arg(toCommandValue(node.score.target).render(ctx.version)),
        arg(node.score.objective.getName()),
      ]),
    );
  }
  readonly type: ScoreGetNode["type"] = "score_get";
}

declare module "../frontend/context" {
  interface FunctionContext {
    /** `scoreboard players get <target> <objective>` - read a score. */
    scoreGet(score: Score): void;
  }
}

FunctionContext.prototype.scoreGet = function (this: FunctionContext, score: Score) {
  this.emit(new ScoreGetNode(score));
};
