// Pulls a body with a spring in the helix simulator.
import { describe, expect, it } from "vitest";
import { Datapack, Item, Objective, ScoreTarget, ScoreVec3, Sim, buildDatapack, math, v26_3_rc_2 } from "helix";
import { installKit } from "../../kit";
import { rigidbody } from ".";

installKit([rigidbody]);

/** A cube centred at y = 70.5 on a spring from 9 blocks above its top face; returns its stored velocity (mm/tick). */
function pull(rest: number) {
  const dp = new Datapack("test", v26_3_rc_2);
  const rb = dp.rigidbody();
  const work = new Objective("rb.work");
  const anchor = ScoreVec3.from((a) => work.score(ScoreTarget(`#anchor_${a}`))).scaled(1000);
  const restScore = work.score(ScoreTarget("#rest")).scaled(1000);
  dp.public("spawn").build((ctx) => rb.spawn(ctx, { item: Item.STONE }));
  dp.public("pull").build((ctx) => {
    math`vec(0.5, 80, 0.5)`.into(anchor);
    restScore.set(rest);
    ctx.execute().as(rb.bodies()).run((b) => rb.spring(b, { anchor, rest: restScore, stiffness: 0.1, attach: [0, 1, 0] }));
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
    // 4 blocks past rest: reels in at the 0.1 blocks/tick cap, plus the 0.049 gravity will add next tick.
    expect(pull(5)).toEqual([0, 149, 0]);
  });

  it("does nothing while slack", () => {
    expect(pull(10)).toEqual([0, 0, 0]);
  });
});
