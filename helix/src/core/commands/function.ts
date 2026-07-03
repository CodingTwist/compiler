import { FunctionNode } from "../ir/node";
import { CodegenContext, CommandHandler } from "../ir/commandhandler";
import { buildCommand } from "../ir/command-builder";

export class FunctionCommand extends CommandHandler<FunctionNode> {
  generate(node: FunctionNode, ctx: CodegenContext): void {
    ctx.emit(
      buildCommand(ctx.version, ["function"], {
        name: `${ctx.datapack.name}:${node.name}`,
      }),
    );
  }
  readonly type: FunctionNode["type"] = "function";
}
