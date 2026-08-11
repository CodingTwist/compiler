import { describe, it, expect } from "vitest";
import { Datapack } from "../ir/datapack";
import { buildDatapack, createHandlerMap } from "../codegen/codegen";
import { FunctionContext } from "../frontend";
import { Block, Macro, Nbt, Pos } from "../values";
import { Range } from "../ir/node";
import { CodegenContext, Dispatcher } from "../ir/commandhandler";
import { IfElseNode, IfHandler, ScoreRangeNode } from "./if";
import { SetblockNode } from "./setblock";
import { FunctionNode } from "../ir/node";
import { Objective } from "../frontend";
import { v1_21_4 } from "../../versions/profiles";

const lines = (main: (ctx: FunctionContext, dp: Datapack) => void) => {
  const dp = new Datapack("p", v1_21_4);
  dp.createFunction("m").build((ctx) => main(ctx, dp));
  return buildDatapack(dp).get("data/p/function/m.mcfunction")!.split("\n");
};

describe("function macros", () => {
  it("prefixes a line carrying a macro argument with $", () => {
    expect(
      lines((ctx) => {
        ctx.setblock(Macro<Pos>("pos"), Block("minecraft:stone"));
        ctx.setblock(Pos(1, 2, 3), Block("minecraft:stone"));
      }),
    ).toEqual([
      "$setblock $(pos) minecraft:stone",
      "setblock 1 2 3 minecraft:stone",
    ]);
  });

  it("puts the $ at the front of a composed execute line, not mid-command", () => {
    const dp = new Datapack("p", v1_21_4);
    const ctx = new CodegenContext(dp, new Dispatcher(createHandlerMap()));
    const body = new FunctionNode("then");
    body.push(
      new SetblockNode({ pos: Macro<Pos>("pos"), block: Block("minecraft:stone") }),
    );
    const cond = new ScoreRangeNode("@s", new Objective("hp"), new Range(1, 1));
    new IfHandler().generate(new IfElseNode(cond, body), ctx);
    expect(ctx.lines[0]).toBe(
      "$execute if score @s hp matches 1 run setblock $(pos) minecraft:stone",
    );
  });

  it("calls with an inline compound and with an NBT source", () => {
    expect(
      lines((ctx, dp) => {
        const place = dp.createFunction("place");
        place.build((c) => c.setblock(Macro<Pos>("pos"), Block("minecraft:stone")));
        ctx.callWith(place, Nbt({ pos: "1 2 3" }));
        ctx.callWith(place, ctx.storage("p:args").at("payload"));
        ctx.call(place);
      }),
    ).toEqual([
      'function p:place {pos:"1 2 3"}',
      "function p:place with storage p:args payload",
      "function p:place",
    ]);
  });
});
