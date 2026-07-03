import { CodegenContext, CommandHandler } from "../ir/commandhandler";
import { ASTNode } from "../ir/node";
import { buildCommand } from "../ir/command-builder";
import { FunctionContext } from "../frontend/context";

export class SayNode extends ASTNode {
  type = "say";
  constructor(public value: string) {
    super();
  }
}

declare module "../frontend/context" {
  interface FunctionContext {
    /** `say <text>` - broadcast a chat message. */
    say(text: string): void;
  }
}

FunctionContext.prototype.say = function (this: FunctionContext, text: string) {
  this.emit(new SayNode(text));
};

export class SayCommand extends CommandHandler<SayNode> {
  generate(node: SayNode, ctx: CodegenContext): void {
    ctx.emit(buildCommand(ctx.version, ["say"], { message: node.value }));
  }
  readonly type: SayNode["type"] = "say";
}
