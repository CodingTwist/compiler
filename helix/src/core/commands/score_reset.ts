import { CodegenContext, CommandHandler } from "../ir/commandhandler";
import { ASTNode } from "../ir/node";
import { Objective } from "../frontend/nodes/objective";
import { Score } from "../frontend/nodes/score";
import { buildCommand } from "../ir/command-builder";
import { FunctionContext } from "../frontend/context";
import { ScoreTarget } from "../values/score_target";
import { toCommandValue } from "../values/value";

export class ScoreResetNode extends ASTNode {
  type = "score_reset";
  constructor(
    public target: ScoreTarget,
    public objective: Objective,
  ) {
    super();
  }
}

export class ScoreResetCommand extends CommandHandler<ScoreResetNode> {
  generate(node: ScoreResetNode, ctx: CodegenContext): void {
    ctx.emit(
      buildCommand(ctx.version, ["scoreboard", "players", "reset"], {
        targets: toCommandValue(node.target).render(ctx.version),
        objective: node.objective.objective,
      }),
    );
  }
  readonly type: ScoreResetNode["type"] = "score_reset";
}

declare module "../frontend/context" {
  interface FunctionContext {
    /**
     * `scoreboard players reset <targets> <objective>` - clears every holder's
     * score for one objective (or, given a specific target, just that holder's
     * score - unlike `remove`, this un-sets it entirely rather than subtracting
     * to it). `ScoreTarget("*")` targets every tracked holder at once.
     */
    scoreReset(score: Score): void;
  }
}

FunctionContext.prototype.scoreReset = function (
  this: FunctionContext,
  score: Score,
) {
  this.emit(new ScoreResetNode(score.target, score.objective));
};
