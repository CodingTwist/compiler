import { ASTNode, FunctionNode } from "../ir/node";
import { CodegenContext, CommandHandler } from "../ir/commandhandler";
import { buildCommand, buildTokens, lit, arg } from "../ir/command-builder";
import { callLine, UNKNOWN_LINE } from "../ir/line-info";
import { FunctionContext } from "../frontend/context";
import { FunctionTagRef } from "../values/function-tag";
import { NbtValue } from "../values/nbt";
import { NbtRef } from "../frontend/nodes/nbt_ref";
// Type-only, or it would close the command-file import cycle.
import type { CallableFn, FunctionRef } from "../function_ref";
import type { Score } from "../frontend/nodes/score";

export class FunctionCommand extends CommandHandler<FunctionNode> {
  generate(node: FunctionNode, ctx: CodegenContext): void {
    ctx.emit(
      buildCommand(ctx.version, ["function"], {
        name: `${ctx.datapack.name}:${node.name}`,
      }),
      callLine(node.name),
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
      // Tag members aren't followed.
      UNKNOWN_LINE,
    );
  }
}

/** `function <ns>:<name> <args>`: calls a macro function with arguments. */
export class MacroCallNode extends ASTNode {
  readonly type = "macro_call";
  constructor(
    public readonly name: string,
    public readonly source: NbtValue | NbtRef,
  ) {
    super();
  }
}

export class MacroCallCommand extends CommandHandler<MacroCallNode> {
  readonly type: MacroCallNode["type"] = "macro_call";

  generate(node: MacroCallNode, ctx: CodegenContext): void {
    const v = ctx.version;
    const src = node.source;
    ctx.emit(
      buildTokens(v, [
        lit("function"),
        arg(`${ctx.datapack.name}:${node.name}`),
        ...(src instanceof NbtRef
          ? [
              lit("with"),
              lit(src.target.kind),
              arg(src.target.locator.render(v)),
              ...(src.path ? [arg(src.path.render(v))] : []),
            ]
          : [arg(src.render(v))]),
      ]),
      callLine(node.name),
    );
  }
}

declare module "../frontend/context" {
  interface FunctionContext {
    /**
     * `function <fn> <args>`: calls a macro function with arguments.
     *
     * `source` is an inline compound or an NBT reference. Macros re-parse every call and
     * can't be
     * validated, so prefer scores, storage or {@link ContextBase.call}.
     */
    callWith(fn: FunctionRef, source: NbtValue | NbtRef): void;
  }
}

FunctionContext.prototype.callWith = function (
  this: FunctionContext,
  fn: FunctionRef,
  source: NbtValue | NbtRef,
) {
  this.emit(new MacroCallNode(fn.getName(), source));
};

declare module "../frontend/context" {
  interface FunctionContext {
    /**
     * `function #<tag>`: calls every function in a tag. Build one with
     * `dp.functionTag(name, { values })`.
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

declare module "../frontend/context" {
  interface FunctionContext {
    /** Calls a `dp.fn` function with `args` copied into its params, storing its result in `into`. */
    invoke<P extends Score[]>(fn: CallableFn<P>, args: { [K in keyof P]: number | Score }, into?: Score): void;
  }
}

FunctionContext.prototype.invoke = function (
  this: FunctionContext,
  fn: CallableFn,
  args: readonly (number | Score)[],
  into?: Score,
) {
  const name = fn.getName();
  if (args.length !== fn.params.length) throw new Error(`${name} takes ${fn.params.length} args, got ${args.length}`);
  if (into && !fn.returns) throw new Error(`${name} returns nothing to store`);
  fn.params.forEach((p, i) => {
    const arg = args[i];
    if (typeof arg === "number") p.set(arg, this);
    else p.assign(arg, this);
  });
  if (into) this.execute().storeResultScore(into).run((c) => c.call(fn));
  else this.call(fn);
};
