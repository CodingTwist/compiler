import { CodegenContext, CommandHandler } from "../ir/commandhandler";
import { ASTNode } from "../ir/node";
import { Objective } from "../frontend/nodes/objective";
import { Score } from "../frontend/nodes/score";
import { buildCommand } from "../ir/command-builder";
import { FunctionContext } from "../frontend/context";
import { ScoreTarget } from "../values/score_target";
import { toCommandValue } from "../values/value";

export class ScoreAddNode extends ASTNode {
  type = "score_add";
  constructor(
    public target: ScoreTarget,
    public objective: Objective,
    public value: number,
  ) {
    super();
  }
}

export class ScoreAddCommand extends CommandHandler<ScoreAddNode> {
  generate(node: ScoreAddNode, ctx: CodegenContext): void {
    ctx.emit(
      buildCommand(ctx.version, ["scoreboard", "players", "add"], {
        targets: toCommandValue(node.target).render(ctx.version),
        objective: node.objective.objective,
        score: node.value,
      }),
    );
  }
  readonly type: ScoreAddNode["type"] = "score_add";
}

declare module "../frontend/context" {
  interface FunctionContext {
    /** `scoreboard players add` - add to a score. */
    scoreAdd(score: Score): void;
  }
}

FunctionContext.prototype.scoreAdd = function (
  this: FunctionContext,
  score: Score,
) {
  this.emit(new ScoreAddNode(score.target, score.objective, Number(score.value)));
};
