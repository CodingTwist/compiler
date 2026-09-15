// Casts rays at bodies in the helix simulator.
import { describe, expect, it } from "vitest";
import { Datapack, Item, Objective, ScoreTarget, ScoreVec3, Selector, Sim, buildDatapack, math, quat, v26_3_rc_2 } from "helix";

const work = new Objective("rb.work");
import type { Quat } from "helix";
import { installKit } from "../../kit";
import { rigidbody } from ".";

installKit([rigidbody]);

/** Spawns cubes in the air, casts +x from x = -5 at y = 70.5, and returns the hit point (mm) or undefined. */
function cast(bodies: { x: number; rotation?: Quat }[], range = 10) {
  const dp = new Datapack("test", v26_3_rc_2);
  const rb = dp.rigidbody();
  bodies.forEach((b, n) => dp.createFunction(`spawn_${n}`).build((ctx) => rb.spawn(ctx, { item: Item.STONE, rotation: b.rotation })));
  dp.createFunction("cast").build((ctx) => {
    const vec = (n: string) => ScoreVec3.from((a) => work.score(ScoreTarget(`#${n}_${a}`))).scaled(1000);
    const ray = { origin: vec("o"), dir: vec("d") };
    math`vec(-5, 70.5, 0.5)`.into(ray.origin);
    math`vec(1, 0, 0)`.into(ray.dir);
    rb.raycast(ctx, ray, range, (b) => b.tag().add(Selector.self(), "hit"));
  });
  const sim = new Sim(buildDatapack(dp), { block: () => "minecraft:air", blockTags: { "minecraft:air": ["minecraft:air"] } });
  sim.load();
  bodies.forEach((b, n) => sim.run(`execute positioned ${b.x} 70.5 0.5 run function test:spawn_${n}`));
  sim.run("function test:cast");
  expect(sim.errors).toEqual([]);
  const x = sim.score("#ray_hit_x", "rb.work");
  return { x, hit: sim.entities.map((e) => e.tags.has("hit")) };
}

describe("rb.raycast", () => {
  it("hits the near face of a level cube", () => {
    expect(cast([{ x: 0.5 }]).x).toBe(0);
  });

  it("hits the corner of a cube turned 45°", () => {
    expect(cast([{ x: 0.5, rotation: quat("y", 45) }]).x).toBeCloseTo(500 - 707, -1);
  });

  it("picks the nearest body and ignores ones out of range", () => {
    expect(cast([{ x: 3.5 }, { x: 0.5 }]).hit).toEqual([false, true]);
    expect(cast([{ x: 8.5 }], 10).hit).toEqual([false]);
  });
});
