// The `ctx.score*` methods.
import { Objective } from "../../frontend/nodes/objective";
import { Score } from "../../frontend/nodes/score";
import { Selector } from "../../frontend/nodes/selector";
import { FunctionContext } from "../../frontend/context";
import { ScoreboardNode, playersNode, scoreInitNode, scoreOpNode, type ScoreOperator } from "./nodes";

declare module "../../frontend/context" {
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
