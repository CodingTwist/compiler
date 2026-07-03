import { ASTNode } from "../ir/node";
import { Objective } from "../frontend/nodes/objective";
import { CodegenContext, CommandHandler } from "../ir/commandhandler";
import { arg, buildTokens, lit, Token } from "../ir/command-builder";
import { FunctionContext } from "../frontend/context";

export class TriggerNode extends ASTNode {
  type = "trigger";
  constructor(
    public objective: Objective,
    public value?: number,
  ) {
    super();
  }
}

/**
 * Build a `trigger <objective> [set <value>]` command node WITHOUT emitting it -
 * for embedding in a click event (`click.command(triggerCmd(obj, 1))`) or anywhere
 * a command node is needed outside a `FunctionContext`. Use `ctx.trigger(...)` to
 * emit one directly. The public factory so consumers never `new TriggerNode`.
 */
export const triggerCmd = (objective: Objective, value?: number): TriggerNode =>
  new TriggerNode(objective, value);

export class TriggerCommand extends CommandHandler<TriggerNode> {
  generate(node: TriggerNode, ctx: CodegenContext): void {
    const tokens: Token[] = [lit("trigger"), arg(node.objective.getName())];
    if (node.value !== undefined) {
      tokens.push(lit("set"), arg(node.value));
    }
    ctx.emit(buildTokens(ctx.version, tokens));
  }
  readonly type: TriggerNode["type"] = "trigger";
}

declare module "../frontend/context" {
  interface FunctionContext {
    /** `trigger <objective> [set <value>]` - fire a trigger objective. */
    trigger(objective: Objective, value?: number): void;
  }
}

FunctionContext.prototype.trigger = function (
  this: FunctionContext,
  objective: Objective,
  value?: number,
) {
  this.emit(new TriggerNode(objective, value));
};
