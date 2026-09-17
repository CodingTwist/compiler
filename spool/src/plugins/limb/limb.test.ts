// Walks a body in the helix simulator and checks the legs stay attached, keep their length and plant on the ground.
import { describe, expect, it } from "vitest";
import { Block, Datapack, Sim, buildDatapack, v26_3_rc_2 } from "helix";
import { limb } from ".";
import type { Leg } from ".";

/** Top of the floor: every block below y=64 is solid, plus a raised block at x=1..2, z=4. */
const FLOOR = 64;
const BONES = [1.0, 1.2];
const MOUNT_Y = 0.5;

function world(legs: Leg[]) {
  const dp = new Datapack("test", v26_3_rc_2);
  limb(dp.group("spider"), { name: "spider", legs, bones: BONES, block: Block.BLACK_CONCRETE, mountY: MOUNT_Y });
  const sim = new Sim(buildDatapack(dp), {
    block: (x, y, z) => (y < FLOOR || (y === FLOOR && x === 1 && z === 4) ? "minecraft:stone" : "minecraft:air"),
    blockTags: { "minecraft:air": ["minecraft:air"] },
  });
  sim.load();
  sim.run(`summon marker 0.5 ${FLOOR} 0.5 {Rotation:[0f,0f]}`);
  const body = sim.entities.at(-1)!.uuid;
  const poll = () => sim.run(`execute as ${body} at @s run function test:zzzprivate/spider/update`);
  const moveTo = (x: number, z: number) => sim.run(`tp ${body} ${x} ${FLOOR} ${z}`);
  const score = (o: string, who = body) => sim.score(who, o) ?? 0;
  const foot = (i: number) => ["x", "y", "z"].map((a) => score(`spider.l${i}f${a}`) / 1000);
  const joint = (k: number) => ["x", "y", "z"].map((a) => score("spider.work", `#j${k}_${a}`) / 1000);
  return { sim, poll, moveTo, foot, joint, clock: (i: number) => score(`spider.l${i}c`) };
}

const dist = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - b[i]));

describe("limb (emitted commands, interpreted)", () => {
  it("plants the foot at rest and reaches it from the hip with bone lengths kept", () => {
    const w = world([{ hip: [0.3, 0.4, 0], rest: [1.4, 0, 0.6], group: 0 }]);
    w.poll();
    expect(w.sim.errors).toEqual([]);
    // Yaw 0: left is +x, forward is +z.
    expect(w.foot(0)).toEqual([1.9, FLOOR, 1.1]);
    expect(w.joint(0)).toEqual([0.3, 0.4 - MOUNT_Y, 0]);
    const end = [1.4, -MOUNT_Y, 0.6];
    expect(dist(w.joint(2), end)).toBeLessThan(0.05);
    BONES.forEach((len, k) => expect(Math.abs(dist(w.joint(k), w.joint(k + 1)) - len)).toBeLessThan(0.02));
    // Knee up, above the straight line from hip to foot.
    expect(w.joint(1)[1]).toBeGreaterThan(0);
  });

  it("steps a drifted foot onto the ground, over a few polls", () => {
    const w = world([{ hip: [0.3, 0.4, 0], rest: [0.6, 0, 1.4], group: 0 }]);
    w.poll();
    w.moveTo(0.5, 2.5);
    w.poll();
    expect(w.sim.errors).toEqual([]);
    expect(w.clock(0)).toBe(2);
    w.poll();
    w.poll();
    expect(w.clock(0)).toBe(0);
    expect(w.foot(0)).toEqual([1.1, FLOOR, 3.9]);
    w.moveTo(0.5, 3.5);
    w.poll();
    w.poll();
    w.poll();
    // Onto the raised block at x=1, z=4: one block up.
    expect(w.foot(0)).toEqual([1.1, FLOOR + 1, 4.9]);
  });

  it("holds a group back while the other group steps", () => {
    const w = world([
      { hip: [0.3, 0.4, 0], rest: [1.2, 0, 0.5], group: 0 },
      { hip: [-0.3, 0.4, 0], rest: [-1.2, 0, 0.5], group: 1 },
    ]);
    w.poll();
    w.moveTo(0.5, 2.5);
    w.poll();
    expect([w.clock(0), w.clock(1)]).toEqual([2, 0]);
    w.poll();
    w.poll();
    expect(w.clock(0)).toBe(0);
    w.poll();
    expect(w.clock(1)).toBe(2);
  });
});
