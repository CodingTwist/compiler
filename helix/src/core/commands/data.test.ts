import { describe, it, expect } from "vitest";
import { Datapack, NbtPath, Pos, Selector } from "../../index";
import { v26_2 } from "../../versions/26_2";
import { buildDatapack } from "../codegen/codegen";

function render(build: (ctx: any) => void): string {
  const dp = new Datapack("t", v26_2);
  dp.createFunction("f").build(build);
  const files = buildDatapack(dp);
  return files.get("data/t/function/f.mcfunction")!.trim();
}

describe("data modify entity/block cross-transfer", () => {
  it("entitySetFromBlock renders `data modify entity ... set from block ...`", () => {
    const line = render((ctx) =>
      ctx
        .data()
        .modify()
        .entitySetFromBlock(
          Selector.allEntities().tag("TunnelStorageEntity").limit(1),
          NbtPath("Items"),
          Pos(2850, 41, 2773),
          NbtPath("Items"),
        ),
    );
    expect(line).toBe(
      "data modify entity @e[tag=TunnelStorageEntity,limit=1] Items set from block 2850 41 2773 Items",
    );
  });

  it("blockSetFromEntity renders `data modify block ... set from entity ...`", () => {
    const line = render((ctx) =>
      ctx
        .data()
        .modify()
        .blockSetFromEntity(
          Pos(2859, 41, 2776),
          NbtPath("Items"),
          Selector.allEntities().tag("TunnelStorageEntity").limit(1),
          NbtPath("Items"),
        ),
    );
    expect(line).toBe(
      "data modify block 2859 41 2776 Items set from entity @e[tag=TunnelStorageEntity,limit=1] Items",
    );
  });
});
