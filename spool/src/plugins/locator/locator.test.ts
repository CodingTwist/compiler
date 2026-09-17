// Moves the locator in the helix simulator.
import { describe, expect, it } from "vitest";
import { Datapack, Objective, ScoreTarget, ScoreVec3, Sim, buildDatapack, math, v26_3_rc_2 } from "helix";
import { locator } from ".";

describe("locator", () => {
  it("summons once and moves to a scaled score position", () => {
    const dp = new Datapack("test", v26_3_rc_2);
    const loc = locator(dp);
    expect(locator(dp)).toBe(loc);
    const point = ScoreVec3.from((a) => new Objective("work").score(ScoreTarget(`#p_${a}`))).scaled(1000);
    dp.public("go").build((ctx) => {
      math`vec(1.25, 70.5, -3)`.into(point);
      loc.ensure(ctx);
      loc.ensure(ctx);
      loc.moveTo(ctx, point);
    });
    const sim = new Sim(buildDatapack(dp));
    sim.load();
    sim.run("function test:go");
    expect(sim.errors).toEqual([]);
    expect(sim.entities).toHaveLength(1);
    expect(sim.entities[0].nbt.Pos).toEqual([1.25, 70.5, -3]);
  });
});
