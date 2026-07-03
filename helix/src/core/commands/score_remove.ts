import { CodegenContext, CommandHandler } from "../ir/commandhandler";
import { ASTNode } from "../ir/node";
import { Objective } from "../frontend/nodes/objective";
import { Score } from "../frontend/nodes/score";
import { buildCommand } from "../ir/command-builder";
import { FunctionContext } from "../frontend/context";
import { ScoreTarget } from "../values/score_target";
import { toCommandValue } from "../values/value";

export class ScoreRemoveNode extends ASTNode {
  type = "score_remove";
  constructor(
    public target: ScoreTarget,
    public objective: Objective,
    public value: number,
  ) {
    super();
  }
}

export class ScoreRemoveCommand extends CommandHandler<ScoreRemoveNode> {
  generate(node: ScoreRemoveNode, ctx: CodegenContext): void {
    ctx.emit(
      buildCommand(ctx.version, ["scoreboard", "players", "remove"], {
        targets: toCommandValue(node.target).render(ctx.version),
        objective: node.objective.objective,
        score: node.value,
      }),
    );
  }
  readonly type: ScoreRemoveNode["type"] = "score_remove";
}

declare module "../frontend/context" {
  interface FunctionContext {
    /** `scoreboard players remove` - subtract from a score (value must be ≥ 0). */
    scoreRemove(score: Score): void;
  }
}

FunctionContext.prototype.scoreRemove = function (
  this: FunctionContext,
  score: Score,
) {
  this.emit(
    new ScoreRemoveNode(score.target, score.objective, Number(score.value)),
  );
};
