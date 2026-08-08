import { describe, it, expect } from "vitest";
import { Datapack } from "../ir/datapack";
import { buildDatapack } from "../codegen/codegen";
import { FunctionContext } from "../frontend";
import { Pos, Block } from "../values";
import { v1_21_4 } from "../../versions/profiles";

function render(build: (ctx: FunctionContext) => void): string {
  const dp = new Datapack("testpack", v1_21_4);
  dp.createFunction("m").build(build);
  return buildDatapack(dp).get("data/testpack/function/m.mcfunction")!;
}

describe("setblock (concept arguments)", () => {
  it("renders Pos and Block concepts", () => {
    expect(render((ctx) => ctx.setblock(Pos(10, 4, 5), Block("minecraft:stone")))).toBe(
      "setblock 10 4 5 minecraft:stone",
    );
  });

  it("renders relative/local positions and block state", () => {
    const out = render((ctx) => {
      ctx.setblock(Pos.rel(0, 1, 0), Block("oak_sign").state({ rotation: 4 }));
      ctx.setblock(Pos.here(), Block("air"));
    });
    expect(out).toBe(
      [
        "setblock ~ ~1 ~ minecraft:oak_sign[rotation=4]",
        "setblock ~ ~ ~ minecraft:air",
      ].join("\n"),
    );
  });

  it("keeps the trailing mode literal AFTER the pos/block args", () => {
    expect(
      render((ctx) => ctx.setblock(Pos(0, 0, 0), Block("stone")).keep()),
    ).toBe("setblock 0 0 0 minecraft:stone keep");
  });

  it("exposes mode as a typed field on the node", () => {
    const dp = new Datapack("testpack", v1_21_4);
    let captured: { mode?: string } | undefined;
    dp.createFunction("m").build((ctx) => {
      const b = ctx.setblock(Pos(1, 2, 3), Block("stone")).strict();
      // The node carries typed args, not a flat token list.
      captured = (b as unknown as { node: { args: { mode?: string } } }).node.args;
    });
    expect(captured?.mode).toBe("strict");
  });

  it("normalizes the namespace and still accepts a raw string", () => {
    expect(render((ctx) => ctx.setblock(Pos(1, 2, 3), Block("dirt")))).toBe(
      "setblock 1 2 3 minecraft:dirt",
    );
    expect(render((ctx) => ctx.setblock("~ ~ ~", "minecraft:tnt"))).toBe(
      "setblock ~ ~ ~ minecraft:tnt",
    );
  });
});
