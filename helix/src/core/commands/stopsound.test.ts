import { describe, it, expect } from "vitest";
import { Datapack, Id, Selector } from "../../index";
import { v26_2 } from "../../versions/26_2";
import { buildDatapack } from "../codegen/codegen";

describe("ctx.stopsound().any()", () => {
  it("renders the `*` (every category) source wildcard", () => {
    const dp = new Datapack("t", v26_2);
    dp.createFunction("f").build((ctx) => {
      ctx.stopsound().any(Selector.self(), Id("minecraft:music.dragon"));
    });
    const files = buildDatapack(dp);
    expect(files.get("data/t/function/f.mcfunction")!.trim()).toBe(
      "stopsound @s * minecraft:music.dragon",
    );
  });
});
