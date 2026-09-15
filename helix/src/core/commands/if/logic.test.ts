import { describe, it, expect } from "vitest";
import { and, not, or } from ".";
import { Datapack } from "../../ir/datapack";
import { buildDatapack } from "../../codegen/codegen";
import { Detect } from "../../frontend/detect";
import { Selector } from "../../frontend/nodes/selector";
import { FunctionContext } from "../../frontend/context";
import { Block, Pos } from "../../values";
import { v1_20_1, v1_21_4 } from "../../../versions/profiles";

/** Builds function `f` and returns its lines, plus the lines of the function it calls if any. */
function build(
  body: (ctx: FunctionContext, a: ReturnType<typeof scores>) => void,
  version = v1_21_4,
) {
  const dp = new Datapack("testpack", version);
  const s = scores(dp);
  dp.createFunction("f").build((ctx) => body(ctx, s));
  buildDatapack(dp);
  const f = dp.files.get("f")!;
  const called = /^function testpack:(\S+)$/.exec(f)?.[1];
  return {
    f: f.split("\n"),
    called: called ? dp.files.get(called)!.split("\n") : [],
  };
}

function scores(dp: Datapack) {
  const ob = dp.objective("v");
  return { a: ob.score("#a"), b: ob.score("#b") };
}

describe("condition algebra", () => {
  it("folds and() into one execute chain", () => {
    const { f } = build((ctx, { a, b }) =>
      ctx.if(and(a.equal(1), b.atLeast(2)), (c) => c.say("hi")),
    );
    expect(f).toEqual([
      "execute if score #a v matches 1 if score #b v matches 2.. run say hi",
    ]);
  });

  it("runs an or() body at most once", () => {
    const { f, called } = build((ctx, { a, b }) =>
      ctx.if(or(a.equal(1), b.equal(2)), (c) => c.say("hi")),
    );
    expect(f[0]).toMatch(/^function testpack:\S+_chain$/);
    expect(called).toEqual([
      "execute if score #a v matches 1 run return run say hi",
      "execute if score #b v matches 2 run return run say hi",
    ]);
  });

  it("pushes not() through and() with De Morgan", () => {
    const { called } = build((ctx, { a, b }) =>
      ctx.if(not(and(a.equal(1), b.equal(2))), (c) => c.say("hi")),
    );
    expect(called).toEqual([
      "execute unless score #a v matches 1 run return run say hi",
      "execute unless score #b v matches 2 run return run say hi",
    ]);
  });

  it("compares two scores, with strict literal bounds", () => {
    const { f } = build((ctx, { a, b }) => {
      ctx.if(a.lessThan(b), (c) => c.say("lt"));
      ctx.if(a.greaterThan(3), (c) => c.say("gt"));
    });
    expect(f).toEqual([
      "execute if score #a v < #b v run say lt",
      "execute if score #a v matches 4.. run say gt",
    ]);
  });

  it("takes a detector, keeping its shifts ahead of the guards they move", () => {
    const pos = Pos.rel(0, 1, 0);
    const { f, called } = build((ctx, { a }) => {
      ctx.if(
        and(Detect.at(pos, Detect.block(pos, Block.STONE)), a.equal(1)),
        (c) => c.say("x"),
      );
      ctx.if(not(Detect.at(pos, Detect.entity(Selector.allPlayers()))), (c) =>
        c.say("y"),
      );
    });
    expect(f[0]).toBe(
      "execute if score #a v matches 1 positioned ~ ~1 ~ if block ~ ~1 ~ minecraft:stone run say x",
    );
    expect(f[1]).toBe(
      "execute positioned ~ ~1 ~ unless entity @a[limit=1] run say y",
    );
    expect(called).toEqual([]);
  });

  it("refuses to negate a forking detector", () => {
    expect(() =>
      build((ctx) =>
        ctx.if(
          not((c) => void c.as(Selector.allPlayers())),
          (c) => c.say("x"),
        ),
      ),
    ).toThrow(/can't negate/);
  });

  it("records which branch an or() took on a version without return run", () => {
    const { f } = build(
      (ctx, { a, b }) =>
        ctx
          .if(or(a.equal(1), b.equal(1)), (c) => c.say("x"))
          .else((c) => c.say("y")),
      v1_20_1,
    );
    expect(f).toEqual([
      "scoreboard players set #f.0 helix.var 0",
      "execute if score #f.0 helix.var matches 0 if score #a v matches 1 run scoreboard players set #f.0 helix.var 1",
      "execute if score #f.0 helix.var matches 0 if score #b v matches 1 run scoreboard players set #f.0 helix.var 1",
      "execute if score #f.0 helix.var matches 1 run say x",
      "execute if score #f.0 helix.var matches 0 run say y",
    ]);
  });
});
