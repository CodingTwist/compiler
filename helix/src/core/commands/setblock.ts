// HAND-WRITTEN reference for the typed-node shape (gen-commands.mjs target).
import { CommandNodeBase } from "../ir/node";
import { CommandHandler, CodegenContext } from "../ir/commandhandler";
import { buildCommand, renderArg } from "../ir/command-builder";
import { FunctionContext } from "../frontend/context";
import { CommandBuilder } from "./base";
import { Block, Pos } from "../values";

/** The how-to-place mode literal that trails `setblock <pos> <block>`. */
export type SetblockMode = "destroy" | "keep" | "replace" | "strict";

/** Typed arguments for `setblock`. A single branch, so a plain object. */
export interface SetblockArgs {
  pos: Pos;
  block: Block;
  mode?: SetblockMode;
}

/** `setblock <pos> <block> [destroy|keep|replace|strict]` */
export class SetblockNode extends CommandNodeBase {
  readonly type = "setblock";
  constructor(public args: SetblockArgs) {
    super();
  }
}

export class SetblockBuilder extends CommandBuilder<SetblockNode> {
  /** `destroy` - break the old block (drops items) before placing. */
  destroy(): this {
    this.node.args.mode = "destroy";
    return this;
  }
  /** `keep` - only place if the target is air. */
  keep(): this {
    this.node.args.mode = "keep";
    return this;
  }
  /** `replace` - overwrite the old block (the default). */
  replace(): this {
    this.node.args.mode = "replace";
    return this;
  }
  /** `strict` - place exactly as given, no state-fixup. */
  strict(): this {
    this.node.args.mode = "strict";
    return this;
  }
}

export class SetblockHandler extends CommandHandler<SetblockNode> {
  readonly type: SetblockNode["type"] = "setblock";

  generate(node: SetblockNode, ctx: CodegenContext): void {
    const v = ctx.version;
    const a = node.args;
    ctx.emit(
      buildCommand(
        v,
        ["setblock"],
        { pos: renderArg(a.pos, v), block: renderArg(a.block, v) },
        a.mode ? [a.mode] : [],
      ),
    );
  }
}

declare module "../frontend/context" {
  interface FunctionContext {
    /** `setblock <pos> <block>` - chain `.keep()` etc. for the mode. */
    setblock(pos: Pos, block: Block): SetblockBuilder;
  }
}

FunctionContext.prototype.setblock = function (
  this: FunctionContext,
  pos: Pos,
  block: Block,
) {
  const node = new SetblockNode({ pos, block });
  this.emit(node);
  return new SetblockBuilder(node);
};
