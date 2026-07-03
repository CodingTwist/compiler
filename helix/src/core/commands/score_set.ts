import { CodegenContext, CommandHandler } from "../ir/commandhandler";
import { ASTNode } from "../ir/node";
import { Objective } from "../frontend/nodes/objective";
import { Score } from "../frontend/nodes/score";
import { buildCommand } from "../ir/command-builder";
import { FunctionContext } from "../frontend/context";
import { ScoreTarget } from "../values/score_target";
import { toCommandValue } from "../values/value";

export class ScoreSetNode extends ASTNode {
  type = "score_set";
  constructor(
    public target: ScoreTarget,
    public objective: Objective,
    public value: number,
  ) {
    super();
  }
}

export class ScoreSetCommand extends CommandHandler<ScoreSetNode> {
  generate(node: ScoreSetNode, ctx: CodegenContext): void {
    ctx.emit(
      buildCommand(ctx.version, ["scoreboard", "players", "set"], {
        targets: toCommandValue(node.target).render(ctx.version),
        objective: node.objective.objective,
        score: node.value,
      }),
    );
  }
  readonly type: ScoreSetNode["type"] = "score_set";
}

declare module "../frontend/context" {
  interface FunctionContext {
    /** `scoreboard players set` - set a score to a literal. */
    scoreSet(score: Score): void;
  }
}

FunctionContext.prototype.scoreSet = function (
  this: FunctionContext,
  score: Score,
) {
  this.emit(new ScoreSetNode(score.target, score.objective, Number(score.value)));
};
