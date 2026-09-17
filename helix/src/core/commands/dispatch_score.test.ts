// `ctx.dispatchScore`: pick a function by score range, call it, return its result.
import { describe, it, expect } from "vitest";
import { Datapack, Range, ScoreTarget } from "../../index";
import { v1_21_4 } from "../../versions/profiles";
import { buildDatapack } from "../codegen/codegen";

function render(build: (ctx: any, dp: Datapack) => void) {
  const dp = new Datapack("testpack", v1_21_4);
  dp.public("f").build((ctx: any) => build(ctx, dp));
  buildDatapack(dp);
  return { dp, lines: dp.files.get("f")!.split("\n") };
}

describe("ctx.dispatchScore", () => {
  it("emits one guarded return-run clause per case, in order", () => {
    const { lines } = render((ctx, dp) => {
      const art = dp.objective("art");
      const ammo = art.score(ScoreTarget("#ammo"));
      const a = dp.public("a");
      a.build((c: any) => c.say("a"));
      const b = dp.public("b");
      b.build((c: any) => c.say("b"));
      ctx.dispatchScore(ammo, [
        { range: Range.exactly(1), fn: a },
        { range: Range.exactly(2), fn: b },
      ]);
    });
    expect(lines).toEqual([
      "execute if score #ammo art matches 1 run return run function testpack:a",
      "execute if score #ammo art matches 2 run return run function testpack:b",
    ]);
  });

  it("with no cases, emits nothing", () => {
    const { lines } = render((ctx, dp) => {
      const art = dp.objective("art");
      const ammo = art.score(ScoreTarget("#ammo"));
      ctx.dispatchScore(ammo, []);
    });
    expect(lines).toEqual([""]);
  });
});
