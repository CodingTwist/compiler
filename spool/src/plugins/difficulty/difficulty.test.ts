// Seeds the level once and dispatches bodies on it.
import { describe, expect, it } from "vitest";
import { Datapack, buildDatapack, v26_3_rc_2 } from "helix";
import { byDifficulty, difficulty } from ".";

describe("difficulty", () => {
  it("seeds only once per pack and builds one body per level", () => {
    const dp = new Datapack("test", v26_3_rc_2);
    difficulty(dp);
    difficulty(dp);
    const fn = byDifficulty(dp, "hit", (c, level) => c.say(level));
    dp.createFunction("go").build((ctx) => ctx.call(fn));
    const files = buildDatapack(dp);
    const text = (path: string) => String(files.get(`data/test/${path}`));
    expect(text("function/load.mcfunction").match(/run difficulty/g)).toHaveLength(1);
    expect(text("function/hit.mcfunction")).toContain("matches 3 run return run function test:hit/hard");
    expect(text("function/hit/easy.mcfunction")).toContain("say easy");
  });
});
