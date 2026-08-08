// HAND-WRITTEN. The whole `scoreboard` family in one file.
//
// Every one of these is the same shape - a fixed literal spine (`scoreboard
// players add`, `scoreboard objectives add`, ...) plus a handful of NAME-KEYED
// args - so one node + one handler covers all of them instead of a node class
// and a handler class per command. Naming the args (rather than emitting them
// positionally) is what lets `buildCommand` re-order them to the target
// version's grammar; see version_breaking_change.test.ts.
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
    ctx.emit(buildCommand(ctx.version, ["scoreboard", ...node.spine], args));
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

/**
 * `scoreboard players <verb> <target> <objective> [<value>]`. The holder slot is
 * named `targets` everywhere except `get`, which takes a single `target`.
 */
const players = (
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
     * `scoreboard players reset <targets> <objective>` - clears every holder's
     * score for one objective (or, given a specific target, just that holder's
     * score - unlike `remove`, this un-sets it entirely rather than subtracting
     * to it). `ScoreTarget("*")` targets every tracked holder at once.
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
  this.emit(players("set", score, true));
};

FunctionContext.prototype.scoreAdd = function (score: Score) {
  this.emit(players("add", score, true));
};

FunctionContext.prototype.scoreRemove = function (score: Score) {
  this.emit(players("remove", score, true));
};

FunctionContext.prototype.scoreReset = function (score: Score) {
  this.emit(players("reset", score));
};

FunctionContext.prototype.scoreGet = function (score: Score) {
  this.emit(players("get", score));
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
