import { describe, expect, it } from "vitest";
import { Datapack } from "../ir/datapack";
import { buildDatapack } from "../codegen/codegen";
import { v1_21_4, v26_3_rc_2 } from "../../versions/profiles";
import type { VersionProfile } from "../../versions/profile";
import { ScoreTarget } from "../values/score_target";
import { math } from "../frontend/nodes/math";
import type { Score } from "../frontend/nodes/score";
import { ContextInt as i } from "../values/context-provider";
import { Sim } from ".";

/** Builds a pack whose tick writes `#out` from `#a` and `#b`, runs one tick, and reads it back. */
function tickOnce(version: VersionProfile, a: number, b: number, formula: (a: Score, b: Score) => ReturnType<typeof math>) {
  const dp = new Datapack("test", version);
  const obj = dp.objective("x");
  const [sa, sb, out] = ["#a", "#b", "#out"].map((n) => obj.score(ScoreTarget(n)));
  dp.tick(() => formula(sa, sb).into(out));
  const sim = new Sim(buildDatapack(dp));
  sim.setScore("#a", "x", a);
  sim.setScore("#b", "x", b);
  sim.tick();
  return { sim, out: sim.score("#out", "x") };
}

describe("Sim", () => {
  it("agrees on math`` between /compute and scoreboard operations", () => {
    const cases: [number, number, (a: Score, b: Score) => ReturnType<typeof math>, number][] = [
      [7, -3, (a, b) => math`${a} * ${b} + 2`, -19],
      [-7, 2, (a, b) => math`${a} / ${b}`, -4],
      [-7, 2, (a, b) => math`${a} % ${b}`, 1],
      [9, 4, (a, b) => math`min(${a}, ${b}) - abs(${b} - ${a})`, -1],
    ];
    for (const [a, b, f, want] of cases) {
      expect(tickOnce(v1_21_4, a, b, f).out).toBe(want);
      expect(tickOnce(v26_3_rc_2, a, b, f).out).toBe(want);
    }
  });

  it("fails a /compute that overflows an int, where scoreboard operations wrap", () => {
    const dp = new Datapack("test", v26_3_rc_2);
    const [a, out] = ["#a", "#out"].map((n) => dp.objective("x").score(ScoreTarget(n)));
    dp.tick((ctx) => {
      a.set(65536);
      ctx.execute().storeResultScore(out).run((b) => b.compute().defaultInteger(i.mul(i.score(a), i.score(a))));
    });
    const sim = new Sim(buildDatapack(dp));
    sim.tick();
    expect(sim.errors).toHaveLength(1);
    expect(sim.score("#out", "x")).toBe(0);
    expect(tickOnce(v1_21_4, 65536, 65536, (x, y) => math`${x} * ${y}`).out).toBe(0);
  });

  it("does /compute float maths in 32-bit floats", () => {
    // 16777217 isn't a float, so it rounds to 16777216 on the way in: 25165824, not 25165825.
    expect(tickOnce(v26_3_rc_2, 16777217, 0, (a) => math`${a} * 1.5`).out).toBe(25165824);
  });

  it("runs execute as/at, tags, selectors, stores and block tags", () => {
    const dp = new Datapack("test", v26_3_rc_2);
    dp.tag("block", "solid", { values: ["minecraft:stone"] });
    const sim = new Sim(buildDatapack(dp), { block: (_x, y) => (y < 64 ? "minecraft:stone" : "minecraft:air") });
    sim.run('summon minecraft:marker 0.5 64 0.5 {data:{id:"minecraft:stone",n:2b},Tags:["a"]}');
    sim.run("summon minecraft:marker 5.5 70 0.5");
    sim.run("execute as @e[type=minecraft:marker,tag=!a] run tag @s add far");
    sim.run("execute as @e[tag=a] at @s if block ~ ~-1 ~ #test:solid run scoreboard players set @s on_ground 1");
    sim.run("execute as @e[tag=far] at @s store result score @s on_ground if block ~ ~-1 ~ #test:solid");
    sim.run("execute positioned 0 64 0 as @e[distance=..2] store result storage test:s y double 0.5 run data get entity @s Pos[1] 10");
    const [near, far] = sim.entities;
    expect(sim.score(near.uuid, "on_ground")).toBe(1);
    expect(sim.score(far.uuid, "on_ground")).toBe(0);
    expect(far.tags.has("far")).toBe(true);
    expect(near.nbt.data).toEqual({ id: "minecraft:stone", n: 2 });
    expect(sim.storage("test:s").y).toBe(320);
    expect(sim.errors).toEqual([]);
  });

  it("returns from a function and reads its result", () => {
    const dp = new Datapack("test", v26_3_rc_2);
    const files = new Map(buildDatapack(dp));
    files.set("data/test/function/f.mcfunction", "return 42\nsay unreachable");
    files.set("data/test/function/g.mcfunction", "execute store result score #r x run function test:f");
    const sim = new Sim(files);
    sim.run("function test:g");
    expect(sim.score("#r", "x")).toBe(42);
  });
});
