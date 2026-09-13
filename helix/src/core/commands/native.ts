import { ASTNode, FunctionNode } from "../ir/node";
import { CodegenContext, CommandHandler } from "../ir/commandhandler";
import { ArgInput, CommandValue, toCommandValue } from "../values/value";
import { Id, IdValue } from "../values/id";
import { VersionProfile } from "../../versions/profile";
import { FunctionContext } from "../frontend/context";

/**
 * A call to a companion server plugin's command, for ops too costly or impossible in
 * vanilla.
 *
 * On `"paper"` builds it emits `<name> <args…>` unvalidated. On `"vanilla"` it runs the
 * `fallback`,
 * or fails the build if there isn't one.
 */
export class NativeCallNode extends ASTNode {
  type = "native";

  constructor(
    public name: CommandValue,
    public args: CommandValue[],
    /** Vanilla commands to run when this build isn't targeting the plugin. */
    public fallback?: FunctionNode,
  ) {
    super();
  }
}

/**
 * Returned by `ctx.native(...)`. `.fallback(...)` sets the commands to run on non-paper
 * builds.
 */
export class NativeCall {
  constructor(
    private readonly ctx: FunctionContext,
    private readonly node: NativeCallNode,
  ) {}

  /** Author the vanilla commands to run when this build isn't targeting Paper. */
  fallback(builder: (ctx: FunctionContext) => void): this {
    const body = this.ctx.createChildFunction("native");
    const child = new (this.ctx.constructor as new (
      fn: FunctionNode,
      v: VersionProfile,
    ) => FunctionContext)(body, this.ctx.version);
    builder(child);
    this.node.fallback = body;
    return this;
  }
}

declare module "../frontend/context" {
  interface FunctionContext {
    /**
     * Calls a Paper plugin command instead of vanilla commands.
     *
     * Only emitted on `"paper"` builds; `"vanilla"` runs `.fallback(...)`, or errors
     * without one.
     */
    native(name: Id | string, ...args: ArgInput[]): NativeCall;
  }
}

FunctionContext.prototype.native = function (
  this: FunctionContext,
  name: Id | string,
  ...args: ArgInput[]
): NativeCall {
  const id = name instanceof IdValue ? name : Id(name);
  const node = new NativeCallNode(id, args.map(toCommandValue));
  this.emit(node);
  return new NativeCall(this, node);
};

export class NativeCallHandler extends CommandHandler<NativeCallNode> {
  readonly type: NativeCallNode["type"] = "native";

  generate(node: NativeCallNode, ctx: CodegenContext): void {
    if (ctx.target === "paper") {
      const parts = [
        node.name.render(ctx.version),
        ...node.args.map((a) => a.render(ctx.version)),
      ].filter((p) => p.length > 0);
      ctx.emitExternal(parts.join(" "));
      return;
    }

    // Vanilla build: run the fallback inline so it validates and shows in the report, or
    // fail if there's none.
    if (!node.fallback) {
      throw new Error(
        `Native op "${node.name.render(ctx.version)}" has no vanilla fallback; ` +
          `it is server-only and cannot be compiled for target "${ctx.target}". ` +
          `Add a .fallback(...) or build with target "paper".`,
      );
    }
    for (const child of node.fallback.nodes) {
      ctx.dispatcher.dispatch(child, ctx);
    }
  }
}
