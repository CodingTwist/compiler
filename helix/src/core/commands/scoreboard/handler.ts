// Lowers a scoreboard node to its command line.
import { CodegenContext, CommandHandler } from "../../ir/commandhandler";
import { buildCommand, ArgValue } from "../../ir/command-builder";
import { toCommandValue } from "../../values/value";
import { commandLine, Effect } from "../../ir/line-info";
import { ScoreboardNode } from "./nodes";

export class ScoreboardCommand extends CommandHandler<ScoreboardNode> {
  readonly type: ScoreboardNode["type"] = "scoreboard";

  generate(node: ScoreboardNode, ctx: CodegenContext): void {
    const args: Record<string, ArgValue> = {};
    for (const [name, value] of Object.entries(node.args)) {
      args[name] = toCommandValue(value).render(ctx.version);
    }
    ctx.emit(
      buildCommand(ctx.version, ["scoreboard", ...node.spine], args),
      commandLine(Effect.NONE),
    );
  }
}
