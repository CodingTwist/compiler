// Pulls a body with a spring in the helix simulator.
import { describe, expect, it } from "vitest";
import { Datapack, Item, Objective, ScoreTarget, ScoreVec3, Sim, buildDatapack, math, v26_3_rc_2 } from "helix";
import { installKit } from "../../kit";
import { rigidbody } from ".";

installKit([rigidbody]);

/** A cube centred at y = 70.5 on a spring from 9 blocks above its top face; returns its velocity (mm/tick). */
function pull(rest: number) {
  const dp = new Datapack("test", v26_3_rc_2);
  const rb = dp.rigidbody();
  const work = new Objective("rb.work");
  const anchor = ScoreVec3.from((a) => work.score(ScoreTarget(`#anchor_${a}`)));
  const restScore = work.score(ScoreTarget("#rest"));
  dp.createFunction("spawn").build((ctx) => rb.spawn(ctx, { item: Item.STONE }));
  dp.createFunction("pull").build((ctx) => {
    math`vec(500, 80000, 500)`.into(anchor);
    restScore.set(rest);
    ctx.execute().as(rb.bodies()).run((b) => rb.spring(b, { anchor, rest: restScore, stiffness: 100, attach: [0, 1, 0] }));
  });
  const sim = new Sim(buildDatapack(dp), { block: () => "minecraft:air", blockTags: { "minecraft:air": ["minecraft:air"] } });
  sim.load();
  sim.run("execute positioned 0.5 70.5 0.5 run function test:spawn");
  sim.run("function test:pull");
  expect(sim.errors).toEqual([]);
  const id = sim.entities[0].uuid;
  return ["vx", "vy", "vz"].map((v) => sim.score(id, `rb.${v}`));
}

describe("rb.spring", () => {
  it("pulls a stretched spring's body toward the anchor", () => {
    // 4000 mm past rest: reels in at the 100 mm/tick cap, plus the 49 gravity will add next tick.
    expect(pull(5000)).toEqual([0, 148, 0]);
  });

  it("does nothing while slack", () => {
    expect(pull(10000)).toEqual([0, 0, 0]);
  });
});
