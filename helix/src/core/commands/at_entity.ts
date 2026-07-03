// HAND-WRITTEN. Anchor commands at an entity's position:
//   execute at <selector> run <command>
// Lets shared / scheduled functions stay position-independent by riding a live
// entity as the anchor - e.g. a Clip's single despawn function restores blocks
// with `place template ... ~ ~ ~` anchored on the still-living display, so one
// shared function works at every play location. Registered via EXTRA_HANDLERS in
// scripts/gen-commands.mjs, never regenerated.
import { generateRunTarget } from "../ir/generate";
import { ASTNode, FunctionNode } from "../ir/node";
import { CodegenContext, CommandHandler } from "../ir/commandhandler";
import { arg, buildTokens, lit, raw } from "../ir/command-builder";
import { toCommandValue } from "../values/value";
import { FunctionContext } from "../frontend/context";
import { Selector } from "../frontend/nodes/selector";
import { Swizzle } from "../values/enums";
import { VersionProfile } from "../../versions/profile";

export class AtEntityNode extends ASTNode {
  type = "at_entity" as const;
  constructor(
    public readonly selector: Selector,
    /**
     * The commands to run anchored at the selector. A single-command body inlines
     * into the `run` clause; a multi-command body commits to one child function so
     * the (potentially expensive) selector is evaluated **once**, not per command.
     */
    public readonly body: FunctionNode,
    /** Optional `align <axes>` (e.g. "xyz") to snap the anchor to the block grid. */
    public readonly align?: Swizzle,
  ) {
    super();
  }
}

export class AtEntityHandler extends CommandHandler<AtEntityNode> {
  readonly type: AtEntityNode["type"] = "at_entity";

  generate(node: AtEntityNode, ctx: CodegenContext): void {
    const command = generateRunTarget(
      node.body,
      ctx.datapack,
      ctx.dispatcher,
    );
    const tail = node.align ? `align ${node.align} run ${command}` : `run ${command}`;
    ctx.emit(
      buildTokens(ctx.version, [
        lit("execute"),
        lit("at"),
        arg(toCommandValue(node.selector).render(ctx.version)),
        raw(tail),
      ]),
    );
  }
}

declare module "../frontend/context" {
  interface FunctionContext {
    /**
     * Run the commands emitted in `build` anchored at `selector`'s position with
     * one `execute at <selector> [align <axes>] run …`. A single command inlines
     * into the `run` clause; multiple commands commit to one child function and
     * the wrapper runs `… run function <child>` - so the selector is evaluated
     * **once**, not re-scanned per command (important when it's an expensive
     * `@a[…,nbt={…}]` filter). Pass `align` (e.g. "xyz") to snap the anchor to the
     * block grid first - needed when block ops (fill/place) ride an entity at a
     * fractional position.
     */
    atEntity(
      selector: Selector,
      build: (ctx: FunctionContext) => void,
      align?: Swizzle,
    ): void;
  }
}

FunctionContext.prototype.atEntity = function (
  this: FunctionContext,
  selector: Selector,
  build: (ctx: FunctionContext) => void,
  align?: Swizzle,
): void {
  // Capture the builder's commands into a uniquely-named child function, then emit
  // a single `execute at <selector> [align] run` wrapper over the whole body. The
  // handler inlines a one-command body or commits a multi-command one to a file -
  // either way the selector is evaluated once per tick, not once per command.
  const body = this.createChildFunction("at");
  const child = new (this.constructor as new (
    fn: FunctionNode,
    v: VersionProfile,
  ) => FunctionContext)(body, this.version);
  build(child);
  this.emit(new AtEntityNode(selector, body, align));
};
