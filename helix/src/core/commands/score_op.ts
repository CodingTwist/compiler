// HAND-WRITTEN. `scoreboard players operation <a> <op> <b>` for every operator.
// The generated `score_set_score` only covers `=`; this exposes the rest
// (`+= -= *= /= %= < > ><`) so score arithmetic stays typed values, not strings.
// Registered via EXTRA_HANDLERS in scripts/gen-commands.mjs.
import { ASTNode } from "../ir/node";
import { Score } from "../frontend/nodes/score";
import { CodegenContext, CommandHandler } from "../ir/commandhandler";
import { buildCommand } from "../ir/command-builder";
import { FunctionContext } from "../frontend/context";
import { toCommandValue } from "../values/value";

/** The `scoreboard players operation` operators. */
export type ScoreOperator = "=" | "+=" | "-=" | "*=" | "/=" | "%=" | "<" | ">" | "><";

export class ScoreOpNode extends ASTNode {
  type = "score_op";
  constructor(
    public a: Score,
    public op: ScoreOperator,
    public b: Score,
  ) {
    super();
  }
}

export class ScoreOpCommand extends CommandHandler<ScoreOpNode> {
  generate(node: ScoreOpNode, ctx: CodegenContext): void {
    ctx.emit(
      buildCommand(ctx.version, ["scoreboard", "players", "operation"], {
        targets: toCommandValue(node.a.target).render(ctx.version),
        targetObjective: node.a.objective.getName(),
        operation: node.op,
        source: toCommandValue(node.b.target).render(ctx.version),
        sourceObjective: node.b.objective.getName(),
      }),
    );
  }
  readonly type: ScoreOpNode["type"] = "score_op";
}

declare module "../frontend/context" {
  interface FunctionContext {
    /** `scoreboard players operation <a> <op> <b>` - score arithmetic. */
    scoreOp(a: Score, op: ScoreOperator, b: Score): void;
  }
}

FunctionContext.prototype.scoreOp = function (
  this: FunctionContext,
  a: Score,
  op: ScoreOperator,
  b: Score,
) {
  this.emit(new ScoreOpNode(a, op, b));
};
