import { describe, it, expect } from "vitest";
import { Datapack } from "../ir/datapack";
import { buildDatapack } from "../codegen/codegen";
import { FunctionContext } from "../frontend";
import { Nbt } from "../values";
import { Selector } from "../frontend/nodes/selector";
import { v1_21_4 } from "../../versions/1_21_4";

function render(build: (ctx: FunctionContext) => void): string[] {
  const dp = new Datapack("p", v1_21_4);
  dp.createFunction("m").build(build);
  return buildDatapack(dp).get("data/p/function/m.mcfunction")!.split("\n");
}

describe("data facade (code-first NBT holders)", () => {
  it("renders reads, removes and whole-compound merge", () => {
    const out = render((ctx) => {
      ctx.storage("example:state").get("players");
      ctx.storage("example:state").get("players", 100);
      ctx.entity(Selector.self()).get("Health");
      ctx.block({ render: () => "~ ~ ~" } as never).get();
      ctx.block({ render: () => "1 2 3" } as never).remove("Items[0]");
      ctx.storage("example:state").mergeAll(Nbt("{wins:0}"));
    });
    expect(out).toEqual([
      "data get storage example:state players",
      "data get storage example:state players 100",
      "data get entity @s Health",
      "data get block ~ ~ ~",
      "data remove block 1 2 3 Items[0]",
      "data merge storage example:state {wins:0}",
    ]);
  });

  it("renders modify with value, from and string-slice sources", () => {
    const out = render((ctx) => {
      const state = ctx.storage("example:state");
      const self = ctx.entity(Selector.self());
      state.set("wins", Nbt("0"));
      state.merge("players", self.at("SelectedItem"));
      state.append("log", self.at("CustomName").slice(0, 10));
      state.insert(0, "queue", self.at("Held"));
    });
    expect(out).toEqual([
      "data modify storage example:state wins set value 0",
      "data modify storage example:state players merge from entity @s SelectedItem",
      "data modify storage example:state log append string entity @s CustomName 0 10",
      "data modify storage example:state queue insert 0 from entity @s Held",
    ]);
  });
});
