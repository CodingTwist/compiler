import { describe, it, expect } from "vitest";
import { Datapack, ScoreTarget } from "../../index";
import { v26_2 } from "../../versions/26_2";
import { buildDatapack } from "../codegen/codegen";

describe("ctx.scoreReset", () => {
  it("renders `scoreboard players reset <targets> <objective>`", () => {
    const dp = new Datapack("t", v26_2);
    const occupant = dp.objective("TunnelOccupant");
    dp.createFunction("f").build((ctx) => {
      ctx.scoreReset(occupant.score(ScoreTarget("*")));
    });
    const files = buildDatapack(dp);
    const body = files.get("data/t/function/f.mcfunction")!.trim();
    expect(body).toBe("scoreboard players reset * TunnelOccupant");
  });
});
