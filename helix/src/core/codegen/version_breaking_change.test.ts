import { describe, it, expect } from "vitest";
import { Datapack } from "../ir/datapack";
import { FunctionNode } from "../ir/node";
import { FunctionContext } from "../frontend/context";
import { Score } from "../frontend/nodes/score";
import { ScoreTarget } from "../values/score_target";
import { Objective } from "../frontend/nodes/objective";
import { buildCommand } from "../ir/command-builder";
import { buildDatapack } from "./codegen";
import { BrigadierNode } from "../commandtree/tree";
import { VersionProfile } from "../../versions/profile";
import { v1_21_4 } from "../../versions/profiles";
import {
  deriveVersion,
  fakeFutureReorderedScoreboard,
} from "../../versions/experimental";

// ---------------------------------------------------------------------------
// FAKE Minecraft versions.
//
// The whole premise of VersionProfiles is that a future game version can change
// command *grammar* and the hand-written handlers absorb it untouched, because
// order/structure is sourced from the version's command tree, not the handler.
// `deriveVersion` (in versions/experimental) mutates a real tree to simulate
// breaking changes no shipped version has, so we can prove that claim
// deliberately rather than hoping a real version happens to differ.
// ---------------------------------------------------------------------------

function scoreboardSet(tree: BrigadierNode): BrigadierNode {
  return tree.children!.scoreboard.children!.players.children!.set;
}

const fakeFuture = (mutate: (tree: BrigadierNode) => void): VersionProfile =>
  deriveVersion(v1_21_4, "99.0-future", mutate);

describe("fake future version: breaking grammar changes are absorbed", () => {
  // -- Breaking change #1: the argument ORDER is reversed -------------------
  // Real 1.21.4:  set <targets> <objective> <score>
  // Fake future:  set <score> <objective> <targets>
  // The arg *names* are preserved (so the handler still fills by name); only
  // the tree's nesting order changes. This is the shared, exported fixture.
  const reordered = fakeFutureReorderedScoreboard;

  it("buildCommand emits args in the FUTURE tree's order, same call site", () => {
    const realOrder = buildCommand(v1_21_4, ["scoreboard", "players", "set"], {
      targets: "@s",
      objective: "obj",
      score: 5,
    });
    const futureOrder = buildCommand(reordered, ["scoreboard", "players", "set"], {
      targets: "@s",
      objective: "obj",
      score: 5,
    });

    expect(realOrder).toBe("scoreboard players set @s obj 5");
    expect(futureOrder).toBe("scoreboard players set 5 obj @s");
  });

  it("the UNCHANGED scoreSet entry follows the new order end-to-end", () => {
    // Same authored node, compiled against the fake version through the real
    // dispatcher + handler. Nothing handler-side knows the order changed.
    const dp = new Datapack("pack", reordered);
    const fn = new FunctionNode("main");
    new FunctionContext(fn, reordered).scoreSet(
      new Score(new Objective("obj", "dummy"), ScoreTarget("@s"), 5),
    );
    dp.functions.set("main", fn);

    const out = buildDatapack(dp).get("data/pack/function/main.mcfunction");
    expect(out).toContain("scoreboard players set 5 obj @s");
  });

  // -- Breaking change #2: a new REQUIRED argument is inserted --------------
  // Fake future:  set <targets> <objective> <score> <dimension>
  // The handler supplies only the first three, so the command is incomplete.
  // The framework must FAIL LOUD here, not silently emit a broken command.
  const requiredAdded = fakeFuture((tree) => {
    const objective = scoreboardSet(tree).children!.targets.children!.objective;
    const score = objective.children!.score;
    score.executable = false; // can no longer stop here
    score.children = {
      dimension: {
        type: "argument",
        parser: "minecraft:dimension",
        executable: true,
      },
    };
  });

  it("a newly-required arg the handler doesn't supply throws, not emits garbage", () => {
    expect(() =>
      buildCommand(requiredAdded, ["scoreboard", "players", "set"], {
        targets: "@s",
        objective: "obj",
        score: 5,
      }),
    ).toThrow(/missing required arguments.*99\.0-future.*dimension/s);
  });

  // -- A renamed arg slot is also caught ------------------------------------
  it("a renamed arg slot is rejected by name, naming the available slots", () => {
    // Future renames `score` -> `value`; handler still passes `score`.
    const renamed = fakeFuture((tree) => {
      const objective =
        scoreboardSet(tree).children!.targets.children!.objective;
      objective.children = { value: objective.children!.score };
    });

    expect(() =>
      buildCommand(renamed, ["scoreboard", "players", "set"], {
        targets: "@s",
        objective: "obj",
        score: 5,
      }),
    ).toThrow(/Unknown argument\(s\) "score".*slots: targets, objective, value/s);
  });
});
