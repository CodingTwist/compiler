// HAND-WRITTEN. The whole `scoreboard` family in one file.
//
// Every command is a literal spine plus a few named args, so one node and handler covers
// them.
// Named args let `buildCommand` reorder them for the target version; see
// version_breaking_change.test.ts.
//
// Registered via EXTRA_HANDLERS in scripts/gen-commands.mjs.
import { ASTNode } from "../ir/node";
import { CodegenContext, CommandHandler } from "../ir/commandhandler";
import { buildCommand, ArgValue } from "../ir/command-builder";
import { Objective } from "../frontend/nodes/objective";
import { Score } from "../frontend/nodes/score";
import { Selector } from "../frontend/nodes/selector";
import { FunctionContext } from "../frontend/context";
import { ArgInput, toCommandValue } from "../values/value";
import { commandLine, Effect } from "../ir/line-info";

/** The `scoreboard players operation` operators. */
export type ScoreOperator = "=" | "+=" | "-=" | "*=" | "/=" | "%=" | "<" | ">" | "><";

export class ScoreboardNode extends ASTNode {
  readonly type = "scoreboard";
  constructor(
    /** The literal spine after `scoreboard`, e.g. `["players", "add"]`. */
    public readonly spine: string[],
    /** Args keyed by the command tree's own argument names. */
    public readonly args: Record<string, ArgInput>,
  ) {
    super();
  }
}

export class ScoreboardCommand extends CommandHandler<ScoreboardNode> {
  readonly type: ScoreboardNode["type"] = "scoreboard";

  generate(node: ScoreboardNode, ctx: CodegenContext): void {
    const args: Record<string, ArgValue> = {};
    for (const [name, value] of Object.entries(node.args)) {
      args[name] = toCommandValue(value).render(ctx.version);
    }
    ctx.emit(buildCommand(ctx.version, ["scoreboard", ...node.spine], args), commandLine(Effect.NONE));
  }
}

/** `scoreboard objectives add <objective> <criteria>` - declare/init an objective. */
export const scoreInitNode = (objective: Objective): ScoreboardNode =>
  new ScoreboardNode(["objectives", "add"], {
    objective: objective.getName(),
    criteria: objective.kind,
  });

/** `scoreboard players operation <a> <op> <b>` - score arithmetic. */
export const scoreOpNode = (
  a: Score,
  op: ScoreOperator,
  b: Score,
): ScoreboardNode =>
  new ScoreboardNode(["players", "operation"], {
    targets: a.target,
    targetObjective: a.objective.getName(),
    operation: op,
    source: b.target,
    sourceObjective: b.objective.getName(),
  });

/** `scoreboard players set|add|remove <target> <objective> <value>` - literal arithmetic. */
export const scoreLitNode = (
  verb: "set" | "add" | "remove",
  score: Score,
  value: number,
): ScoreboardNode =>
  new ScoreboardNode(["players", verb], {
    targets: score.target,
    objective: score.objective.getName(),
    score: value,
  });

/**
 * `scoreboard players <verb> <target> <objective> [<value>]`. The holder arg is `targets`,
 * except `get` uses `target`.
 */
export const playersNode = (
  verb: string,
  score: Score,
  withValue = false,
): ScoreboardNode =>
  new ScoreboardNode(["players", verb], {
    [verb === "get" ? "target" : "targets"]: score.target,
    objective: score.objective.getName(),
    ...(withValue ? { score: Number(score.value) } : {}),
  });

declare module "../frontend/context" {
  interface FunctionContext {
    /** `scoreboard objectives add` - declare/init an objective. */
    scoreInit(objective: Objective): void;
    /** `scoreboard players set` - set a score to a literal. */
    scoreSet(score: Score): void;
    /** `scoreboard players add` - add to a score. */
    scoreAdd(score: Score): void;
    /** `scoreboard players remove` - subtract from a score (value must be ≥ 0). */
    scoreRemove(score: Score): void;
    /**
     * `scoreboard players reset <targets> <objective>`: unsets the score.
     * `ScoreTarget("*")` resets every holder.
     */
    scoreReset(score: Score): void;
    /** `scoreboard players get <target> <objective>` - read a score. */
    scoreGet(score: Score): void;
    /** `scoreboard players operation <a> <op> <b>` - score arithmetic. */
    scoreOp(a: Score, op: ScoreOperator, b: Score): void;
    /** `scoreboard players operation <a> = <b>` - copy one score into another. */
    scoreSetScore(score: Score, score2: Score): void;
    /** `scoreboard players enable` - enable a trigger objective for players. */
    scoreEnable(selector: Selector, objective: Objective): void;
  }
}

FunctionContext.prototype.scoreInit = function (objective: Objective) {
  this.emit(scoreInitNode(objective));
};

FunctionContext.prototype.scoreSet = function (score: Score) {
  this.emit(playersNode("set", score, true));
};

FunctionContext.prototype.scoreAdd = function (score: Score) {
  this.emit(playersNode("add", score, true));
};

FunctionContext.prototype.scoreRemove = function (score: Score) {
  this.emit(playersNode("remove", score, true));
};

FunctionContext.prototype.scoreReset = function (score: Score) {
  this.emit(playersNode("reset", score));
};

FunctionContext.prototype.scoreGet = function (score: Score) {
  this.emit(playersNode("get", score));
};

FunctionContext.prototype.scoreOp = function (
  a: Score,
  op: ScoreOperator,
  b: Score,
) {
  this.emit(scoreOpNode(a, op, b));
};

FunctionContext.prototype.scoreSetScore = function (score: Score, score2: Score) {
  this.emit(scoreOpNode(score, "=", score2));
};

FunctionContext.prototype.scoreEnable = function (
  selector: Selector,
  objective: Objective,
) {
  if (objective.kind !== "trigger") {
    throw new Error(
      `Objective "${objective.getName()}" must be trigger to enable`,
    );
  }
  this.emit(
    new ScoreboardNode(["players", "enable"], {
      targets: selector,
      objective: objective.getName(),
    }),
  );
};
