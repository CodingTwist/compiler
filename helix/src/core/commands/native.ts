import { ASTNode, FunctionNode } from "../ir/node";
import { CodegenContext, CommandHandler } from "../ir/commandhandler";
import { ArgInput, CommandValue, toCommandValue } from "../values/value";
import { Id, IdValue } from "../values/id";
import { VersionProfile } from "../../versions/profile";
import { FunctionContext } from "../frontend/context";

/**
 * A call to a native command provided by a companion server plugin (a Paper
 * Brigadier command), used as a deliberate escape hatch when an op is too
 * expensive as command expansion or only a plugin can do it at all.
 *
 * The op is gated on the build's {@link CodegenContext.target}:
 *  - `"paper"`  → emit `<name> <args…>` as an external line (skips vanilla
 *    Brigadier validation, since its leading keyword isn't a vanilla command).
 *  - `"vanilla"` → run the `fallback` body's commands instead; if there is no
 *    fallback the op is server-only and a vanilla build fails loudly.
 *
 * The command name is a typed {@link IdValue} and every argument a
 * {@link CommandValue}, so values still render version-aware - native calls
 * honour the "typed concepts, not strings" rule like every other command.
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
 * Builder returned by `ctx.native(...)`. The native call is already emitted;
 * `.fallback(...)` optionally authors the vanilla commands to run instead on a
 * non-`paper` build (graceful degradation, e.g. in singleplayer).
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
     * Call a native server-plugin command (a Paper Brigadier command) instead
     * of expanding to vanilla commands. Only emitted on a `"paper"` build; on a
     * `"vanilla"` build it runs the `.fallback(...)` body, or errors if none was
     * given. `name` is the command id (`Id("paper:pathfind")` or a bare string);
     * `args` are typed values (`Selector`, `Pos`, …) rendered version-aware.
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

    // Non-paper build: run the fallback commands inline (so they validate and
    // show up in the cost report like any other command), or fail if the op is
    // server-only with nothing to fall back to.
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
