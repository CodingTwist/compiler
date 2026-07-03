import { ASTNode } from "../ir/node";
import { Score } from "../frontend/nodes";
import { CodegenContext, CommandHandler } from "../ir/commandhandler";
import { buildCommand } from "../ir/command-builder";
import { FunctionContext } from "../frontend/context";
import { toCommandValue } from "../values/value";

export class ScoreSetScoreNode extends ASTNode {
  type = "score_set_score";
  constructor(
    public score1: Score,
    public score2: Score,
  ) {
    super();
  }
}

export class ScoreSetScoreCommand extends CommandHandler<ScoreSetScoreNode> {
  generate(node: ScoreSetScoreNode, ctx: CodegenContext): void {
    ctx.emit(
      buildCommand(ctx.version, ["scoreboard", "players", "operation"], {
        targets: toCommandValue(node.score1.target).render(ctx.version),
        targetObjective: node.score1.objective.getName(),
        operation: "=",
        source: toCommandValue(node.score2.target).render(ctx.version),
        sourceObjective: node.score2.objective.getName(),
      }),
    );
  }
  readonly type: ScoreSetScoreNode["type"] = "score_set_score";
}

declare module "../frontend/context" {
  interface FunctionContext {
    /** `scoreboard players operation <a> = <b>` - copy one score into another. */
    scoreSetScore(score: Score, score2: Score): void;
  }
}

FunctionContext.prototype.scoreSetScore = function (
  this: FunctionContext,
  score: Score,
  score2: Score,
) {
  this.emit(new ScoreSetScoreNode(score, score2));
};
