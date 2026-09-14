import { describe, it, expect } from "vitest";
import { Datapack, Objective, ScoreTarget, Selector } from "../../../index";
import { v26_2 } from "../../../versions/profiles";
import { buildDatapack } from "../../codegen/codegen";

function render(build: (ctx: any) => void): string[] {
  const dp = new Datapack("t", v26_2);
  dp.createFunction("f").build(build);
  buildDatapack(dp);
  return dp.files.get("f")!.split("\n");
}

const dummy = new Objective("d");
const D = (n: string) => dummy.score(ScoreTarget(n));

describe("run-clause peepholes", () => {
  it("splices a nested execute body into the parent's clauses", () => {
    const lines = render((ctx) =>
      ctx
        .execute()
        .as(Selector.allPlayers())
        .run((b: any) => b.execute().at(Selector.self()).run((c: any) => c.say("x"))),
    );
    expect(lines).toEqual(["execute as @a at @s run say x"]);
  });

  it("drops the line for an empty body, unless a store clause reads its result", () => {
    expect(render((ctx) => ctx.execute().as(Selector.allPlayers()).run(() => {}))).toEqual([""]);
    const [line] = render((ctx) =>
      ctx.execute().storeSuccessScore(D("#ok")).as(Selector.allPlayers()).run(() => {}),
    );
    expect(line).toBe("execute store success score #ok d as @a run function t:zzz/f/exec_0");
  });
});

describe("entity-test limit peephole", () => {
  it("clips an unbounded if/unless entity to limit=1 when the chain runs something", () => {
    const [line] = render((ctx) =>
      ctx.execute().unlessEntity(Selector.allEntities().tag("x")).run((b: any) => b.say("none")),
    );
    expect(line).toBe("execute unless entity @e[tag=x,limit=1] run say none");
  });

  it("leaves a bare store+if entity chain alone - its result is the match count", () => {
    const [line] = render((ctx) =>
      ctx.execute().storeResultScore(D("#n")).ifEntity(Selector.allEntities().tag("x")),
    );
    expect(line).toBe("execute store result score #n d if entity @e[tag=x]");
  });
});
