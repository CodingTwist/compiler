import { ASTNode, FunctionNode } from "../ir/node";
import { CodegenContext, CommandHandler } from "../ir/commandhandler";
import { buildCommand } from "../ir/command-builder";
import { FunctionContext } from "../frontend/context";
import { FunctionTagRef } from "../values/function-tag";

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

/** `function #<ns>:<name>` - run every member of a function tag. */
export class FunctionTagCallNode extends ASTNode {
  readonly type = "function_tag_call";
  constructor(public readonly tag: FunctionTagRef) {
    super();
  }
}

export class FunctionTagCallCommand extends CommandHandler<FunctionTagCallNode> {
  readonly type: FunctionTagCallNode["type"] = "function_tag_call";

  generate(node: FunctionTagCallNode, ctx: CodegenContext): void {
    ctx.emit(
      buildCommand(ctx.version, ["function"], {
        name: node.tag.render(ctx.version),
      }),
    );
  }
}

declare module "../frontend/context" {
  interface FunctionContext {
    /**
     * `function #<tag>` - call a **function tag**, running every member.
     *
     * The single-function sibling is {@link ContextBase.call}, which takes a
     * `FunctionRef`. Build the tag with `dp.functionTag(name, { values })`.
     */
    callTag(tag: FunctionTagRef): void;
  }
}

FunctionContext.prototype.callTag = function (
  this: FunctionContext,
  tag: FunctionTagRef,
) {
  this.emit(new FunctionTagCallNode(tag));
};
