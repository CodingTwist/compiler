import { ASTNode, Range } from "../ir/node";
import { CodegenContext, CommandHandler } from "../ir/commandhandler";
import { buildCommand } from "../ir/command-builder";
import { requireCommand } from "../../versions/capabilities";
import { FunctionContext } from "../frontend/context";

export class RandomValueNode extends ASTNode {
  type = "random_value";
  range: Range;

  constructor(
    private min: number,
    private max: number,
  ) {
    super();
    this.range = new Range(this.min, this.max);
  }
}

export class RandomCommand extends CommandHandler<RandomValueNode> {
  generate(node: RandomValueNode, ctx: CodegenContext): void {
    ctx.emit(
      buildCommand(ctx.version, ["random", "value"], { range: `${node.range}` }),
    );
  }
  readonly type: RandomValueNode["type"] = "random_value";
}

declare module "../frontend/context" {
  interface FunctionContext {
    /**
     * Roll a random value, gated on the target version: `random` was added in
     * 1.20.3, so authoring against an older target throws HERE (at the call).
     * Returns a version-neutral node other commands (e.g. score storeResult)
     * consume - it is not emitted on its own.
     */
    random(min: number, max: number): RandomValueNode;
  }
}

FunctionContext.prototype.random = function (
  this: FunctionContext,
  min: number,
  max: number,
) {
  requireCommand(this.version, ["random", "value"], "ctx.random()");
  return new RandomValueNode(min, max);
};
