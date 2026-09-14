// The scoreboard node, and builders for each `scoreboard` command shape.
import { ASTNode } from "../../ir/node";
import { Objective } from "../../frontend/nodes/objective";
import { Score } from "../../frontend/nodes/score";
import { ArgInput } from "../../values/value";

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
 * `scoreboard players get|reset|enable <target> <objective>`. The holder arg is `targets`,
 * except `get` uses `target`.
 */
export const playersNode = (verb: "get" | "reset" | "enable", score: Score): ScoreboardNode =>
  new ScoreboardNode(["players", verb], {
    [verb === "get" ? "target" : "targets"]: score.target,
    objective: score.objective.getName(),
  });
