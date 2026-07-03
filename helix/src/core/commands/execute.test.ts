import { describe, it, expect } from "vitest";
import { Datapack, Objective, ScoreTarget, Selector, Id, NbtPath, Pos, Range, Block } from "../../index";
import { v26_2 } from "../../versions/26_2";
import { buildDatapack } from "../codegen/codegen";

function render(build: (ctx: any) => void): string[] {
  const dp = new Datapack("t", v26_2);
  dp.createFunction("f").build(build);
  buildDatapack(dp);
  return dp.files.get("f")!.split("\n");
}

const dummy = new Objective("d");
const D = (n: string) => dummy.score(ScoreTarget(n));

describe("ctx.execute() chain builder", () => {
  it("composes store + if + run in author order", () => {
    const [line] = render((ctx) =>
      ctx
        .execute()
        .storeSuccessScore(D("#x.30"))
        .ifScoreMatches(D("#x"), new Range(1073741824, undefined))
        .run((b: any) => b.scoreRemove(D("#x").remove(1073741824))),
    );
    expect(line).toBe(
      "execute store success score #x.30 d if score #x d matches 1073741824.. run scoreboard players remove #x d 1073741824",
    );
  });

  it("renders as/in/positioned context shifts with a function run target", () => {
    const dp = new Datapack("t", v26_2);
    const fn = dp.createFunction("target");
    fn.build(() => {});
    dp.createFunction("f").build((ctx) =>
      ctx
        .execute()
        .as(Selector.uuid("d4bd74a7-4e82-4a07-8850-dfc4d89f9e2f"))
        .in(Id("minecraft:overworld"))
        .positioned(Pos.raw("0.0 0.0 0.0"))
        .run((b: any) => b.call(fn)),
    );
    buildDatapack(dp);
    expect(dp.files.get("f")).toBe(
      "execute as d4bd74a7-4e82-4a07-8850-dfc4d89f9e2f in minecraft:overworld positioned 0.0 0.0 0.0 run function t:target",
    );
  });

  it("renders anchored + if/unless block guards", () => {
    const [line] = render((ctx) =>
      ctx
        .execute()
        .anchored("eyes")
        .positioned(Pos.local(0, 0, 0.5))
        .unlessBlock(Pos.here(), Block("#minecraft:air"))
        .run((b: any) => b.scoreSet(D("#hit").set(1))),
    );
    expect(line).toBe(
      "execute anchored eyes positioned ^ ^ ^0.5 unless block ~ ~ ~ #minecraft:air run scoreboard players set #hit d 1",
    );
  });

  it("renders facing <pos> and facing entity <sel> <anchor>", () => {
    const [line] = render((ctx) =>
      ctx
        .execute()
        .anchored("eyes")
        .facingEntity(Selector.allEntities().tag("anchor").limit(1), "feet")
        .facing(Pos.here())
        .run((b: any) => b.scoreSet(D("#x").set(1))),
    );
    expect(line).toBe(
      "execute anchored eyes facing entity @e[tag=anchor,limit=1] feet facing ~ ~ ~ run scoreboard players set #x d 1",
    );
  });

  it("supports store result storage and scoreGet run targets", () => {
    const [line] = render((ctx) =>
      ctx
        .execute()
        .storeResultStorage(Id("t:temp"), NbtPath("matrix.x"), "double", 1)
        .run((b: any) => b.scoreGet(D("#x"))),
    );
    expect(line).toBe(
      "execute store result storage t:temp matrix.x double 1 run scoreboard players get #x d",
    );
  });

  it("returnRun renders `return run <command>` and nests under execute", () => {
    const dp = new Datapack("t", v26_2);
    const fn = dp.createFunction("m");
    fn.build(() => {});
    dp.createFunction("f").build((ctx) =>
      ctx
        .execute()
        .ifEntity(Selector.self().xRotation(new Range(-90, -90)))
        .run((b: any) => b.returnRun((r: any) => r.call(fn))),
    );
    buildDatapack(dp);
    expect(dp.files.get("f")).toBe(
      "execute if entity @s[x_rotation=-90] run return run function t:m",
    );
  });

  it("scoreOp emits every operator", () => {
    const [line] = render((ctx) => ctx.scoreOp(D("#x"), "><", D("#z")));
    expect(line).toBe("scoreboard players operation #x d >< #z d");
  });

  it("teleport resolves the targets+location overload (not the destination leaf)", () => {
    const [a, b] = render((ctx) => {
      ctx.teleport(Selector.self(), Pos.local(1, 0, 0));
      ctx.teleport(Selector.self(), Pos.raw("0.0 0.0 0.0"), Pos.raw("0.0 0.0"));
    });
    expect(a).toBe("teleport @s ^1 ^ ^");
    expect(b).toBe("teleport @s 0.0 0.0 0.0 0.0 0.0");
  });
});
