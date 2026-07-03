import { generateSingleNode } from "../ir/generate";
import { ASTNode } from "../ir/node";
import { SelectorNode } from "./selector";
import { Objective } from "../frontend/nodes/objective";
import { Selector } from "../frontend/nodes/selector";
import { CodegenContext, CommandHandler } from "../ir/commandhandler";
import { buildCommand } from "../ir/command-builder";
import { FunctionContext } from "../frontend/context";

export class ScoreEnableNode extends ASTNode {
  type = "score_enable";
  constructor(
    public target: SelectorNode,
    public objective: Objective,
  ) {
    super();
  }
}

export class ScoreEnableCommand extends CommandHandler<ScoreEnableNode> {
  generate(node: ScoreEnableNode, ctx: CodegenContext): void {
    const target = generateSingleNode(node.target, ctx.datapack, ctx.dispatcher);
    ctx.emit(
      buildCommand(ctx.version, ["scoreboard", "players", "enable"], {
        targets: target,
        objective: node.objective.getName(),
      }),
    );
  }
  readonly type: ScoreEnableNode["type"] = "score_enable";
}

declare module "../frontend/context" {
  interface FunctionContext {
    /** `scoreboard players enable` - enable a trigger objective for players. */
    scoreEnable(selector: Selector, objective: Objective): void;
  }
}

FunctionContext.prototype.scoreEnable = function (
  this: FunctionContext,
  selector: Selector,
  objective: Objective,
) {
  if (objective.kind !== "trigger") {
    throw new Error(
      `Objective "${objective.getName()}" must be trigger to enable`,
    );
  }
  this.emit(new ScoreEnableNode(selector.build(), objective));
};
