import { CodegenContext, CommandHandler } from "../ir/commandhandler";
import { ASTNode } from "../ir/node";
import { Objective } from "../frontend/nodes/objective";
import { buildCommand } from "../ir/command-builder";
import { FunctionContext } from "../frontend/context";

export class ScoreInitNode extends ASTNode {
  type = "score_init";
  constructor(public objective: Objective) {
    super();
  }
}

export class ScoreInitCommand extends CommandHandler<ScoreInitNode> {
  generate(node: ScoreInitNode, ctx: CodegenContext): void {
    ctx.emit(
      buildCommand(ctx.version, ["scoreboard", "objectives", "add"], {
        objective: node.objective.getName(),
        criteria: node.objective.kind,
      }),
    );
  }
  readonly type: ScoreInitNode["type"] = "score_init";
}

declare module "../frontend/context" {
  interface FunctionContext {
    /** `scoreboard objectives add` - declare/init an objective. */
    scoreInit(objective: Objective): void;
  }
}

FunctionContext.prototype.scoreInit = function (
  this: FunctionContext,
  objective: Objective,
) {
  this.emit(new ScoreInitNode(objective));
};
