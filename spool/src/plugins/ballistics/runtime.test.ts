import { describe, expect, it } from "vitest";
import {
  Datapack,
  EntityType,
  Selector,
  buildDatapack,
  v1_21_4,
  type Vec3,
} from "helix";
import { installKit } from "../../kit";
import { ballistics, type RuntimeShotOptions } from "./index";
import { closestApproach, simulate, trajectoryBasis } from "./physics";
import { PROJECTILES } from "./projectiles";

installKit([ballistics]);

const TNT = PROJECTILES.tnt;

function fire(name: string, opts: RuntimeShotOptions = {}): string[] {
  const dp = new Datapack("art", v1_21_4);
  dp.ballisticRuntime(name, {
    from: Selector.allEntities().tag("gun").limit(1),
    to: Selector.allEntities().tag("mark").limit(1),
    ...opts,
  });
  return [...buildDatapack(dp)]
    .filter(([path]) => path.endsWith(".mcfunction"))
    .flatMap(([, body]) => body.split("\n"))
    .filter((line) => line.length > 0);
}

/**
 * Re-runs the emitted integer maths, truncation included, to test the pack's real answer.
 */
function scoreboardVelocity(from: Vec3, to: Vec3, ticks: number): Vec3 {
  const { A, G } = trajectoryBasis(TNT, ticks);
  const aFixed = Math.round(A[ticks] * 100);
  const gFixed = Math.round(G[ticks] * 100);
  const centi = (x: number) => Math.trunc(x * 100); // `data get … 100`
  return [0, 1, 2].map((axis) => {
    let s = centi(to[axis]) - centi(from[axis]);
    if (axis === 1) s -= gFixed;
    s = Math.trunc((s * 10000) / aFixed); // `*= #v_scale ; /= #a`
    expect(Math.abs(s)).toBeLessThan(2 ** 31);
    return s / 10000;
  }) as unknown as Vec3;
}

describe("runtime ballistics", () => {
  it("emits one solve: read six coords, scale, divide, write Motion", () => {
    const lines = fire("fire/live", { ticks: 40 });
    // The basis at tick 40 is baked in as literals; older versions need scratch scores for
    // them.
    const { A, G } = trajectoryBasis(TNT, 40);
    expect(lines).toContain(
      `scoreboard players set #_t0 ballistics ${Math.round(A[40] * 100)}`,
    );
    expect(lines).toContain(
      "scoreboard players operation #vx ballistics /= #_t0 ballistics",
    );
    expect(lines).toContain("scoreboard players set #_t0 ballistics 10000");
    // Gravity comes out of the vertical axis before the divide; G(40) is negative.
    expect(G[40]).toBeLessThan(0);
    expect(lines).toContain(
      `scoreboard players add #vy ballistics ${-Math.round(G[40] * 100)}`,
    );

    for (const axis of [0, 1, 2]) {
      const v = ["#vx", "#vy", "#vz"][axis];
      // The three `at` reads are grouped under one `at`.
      expect(lines).toContain(
        `execute store result score ${v} ballistics run data get entity @e[tag=mark,limit=1] Pos[${axis}] 100`,
      );
      const p = ["#px", "#py", "#pz"][axis];
      expect(lines).toContain(
        `execute store result score ${p} ballistics run data get entity @e[tag=gun,limit=1] Pos[${axis}] 100`,
      );
      expect(lines).toContain(
        `execute store result entity @e[tag=art.shot,limit=1,type=minecraft:tnt] Motion[${axis}] double 0.0001 ` +
          `run scoreboard players get ${v} ballistics`,
      );
    }
    // Summoned at the launcher, fused to airburst on arrival, tagged only long enough
    // to have its Motion written.
    expect(
      lines.some((l) =>
        l.startsWith(
          "execute at @e[tag=gun,limit=1] run summon minecraft:tnt ~ ~ ~ ",
        ),
      ),
    ).toBe(true);
    expect(lines.some((l) => l.includes("fuse:40s"))).toBe(true);
    expect(lines).toContain(
      "tag @e[tag=art.shot,limit=1,type=minecraft:tnt] remove art.shot",
    );
    // Nothing fires unless every axis is within ±10; the return value says which happened.
    expect(lines).toContain(
      "execute unless score #vx ballistics matches -100000..100000 run return 0",
    );
    expect(lines).toContain("return 1");
  });

  it("defaults to @s throwing at @p", () => {
    const dp = new Datapack("art", v1_21_4);
    dp.ballisticRuntime("throw");
    const lines = [...buildDatapack(dp)]
      .flatMap(([, body]) => body.split("\n"))
      .filter((l) => l.length > 0);
    // `at @s` first, so `@p` is the *thrower's* nearest player. The reads share one `at`.
    expect(lines).toContain("execute at @s run function art:zzzprivate/throw/group_0");
    expect(lines).toContain(
      "execute store result score #vx ballistics run data get entity @p Pos[0] 100",
    );
    expect(lines.some((l) => l.startsWith("execute at @s run summon"))).toBe(
      true,
    );
  });

  it("lead adds one shared per-tick tracker and aims ahead of the target", () => {
    const dp = new Datapack("art", v1_21_4);
    dp.ballisticRuntime("a", { lead: true, ticks: 30 });
    dp.ballisticRuntime("b", { lead: true, ticks: 60 });
    const files = [...buildDatapack(dp)].filter(([p]) =>
      p.endsWith(".mcfunction"),
    );
    const lines = files
      .flatMap(([, b]) => b.split("\n"))
      .filter((l) => l.length > 0);

    // Emitted once, however many shots ask for it.
    expect(files.filter(([p]) => p.includes("track_targets"))).toHaveLength(1);
    expect(
      lines.filter((l) => l.includes("run function art:zzzprivate/plugin/ballistics/track_targets")),
    ).toHaveLength(1);
    // Only players under fire are diffed, and firing is what enrols them.
    expect(lines).toContain(
      "execute as @a[tag=ballistics.tracked] run function art:zzzprivate/plugin/ballistics/track_targets",
    );
    expect(lines).toContain("execute as @p run function art:zzzprivate/plugin/ballistics/track_enroll");
    expect(lines).toContain("tag @s add ballistics.tracked");
    // Enrolling reseeds the previous position, so the first diff isn't against stale data.
    expect(lines).toContain(
      "execute unless entity @s[tag=ballistics.tracked] run function art:zzzprivate/plugin/ballistics/track_init",
    );
    expect(lines).toContain("scoreboard players set @s ballistics.vx 0");
    expect(lines).toContain(
      "execute if score @s ballistics.ttl matches ..0 run tag @s remove ballistics.tracked",
    );
    // v = now - then, then then = now.
    expect(lines).toContain(
      "execute store result score @s ballistics.vx run data get entity @s Pos[0] 100",
    );
    expect(lines).toContain(
      "scoreboard players operation @s ballistics.vx -= @s ballistics.px",
    );
    // Target point is displaced by velocity x flight time inside the solve.
    expect(lines).toContain(
      "scoreboard players operation #lx ballistics = @p ballistics.vx",
    );
    expect(lines).toContain(
      "scoreboard players operation #_t0 ballistics = #lx ballistics",
    );
    expect(lines).toContain("scoreboard players set #_t1 ballistics 30");
    expect(lines).toContain(
      "scoreboard players operation #_t0 ballistics *= #_t1 ballistics",
    );
    expect(lines).toContain(
      "scoreboard players operation #vx ballistics += #_t0 ballistics",
    );
  });

  it("the integer arithmetic still lands the shot", () => {
    const from: Vec3 = [0.5, 70, 0.5];
    for (const [to, ticks] of [
      [[80.5, 64, 20.5], 40],
      [[-120.5, 96, 60.5], 60],
      [[12.5, 71, -3.5], 20],
      [[300.5, 64, 300.5], 70],
    ] as const) {
      const v = scoreboardVelocity(from, to as Vec3, ticks);
      const hit = closestApproach(simulate(from, v, TNT, ticks), to as Vec3);
      // Quantisation only: centi-block reads, 1e-4 velocities, centi-precision A(n).
      expect(hit.distance).toBeLessThan(0.25);
      expect(Math.abs(hit.tick - ticks)).toBeLessThan(1);
    }
  });
});

it("shellFunction lifts the summon into its own one-line function", () => {
  const dp = new Datapack("art", v1_21_4);
  dp.ballisticRuntime("throw", { ticks: 20, shellFunction: "shell/throw" });
  const files = new Map(buildDatapack(dp));
  const shell = files.get("data/art/function/shell/throw.mcfunction")!;
  expect(shell.trim().split("\n")).toHaveLength(1);
  expect(shell).toContain("summon minecraft:tnt");
  const shot = files.get("data/art/function/zzzprivate/throw.mcfunction")!;
  expect(shot).toContain("execute at @s run function art:shell/throw");
  expect(shot).not.toContain("summon");
  expect(() =>
    dp.ballisticRuntime("throw2", { shellFunction: "shell/throw" }),
  ).toThrow(/already exists/);
});

it("a shellFunction callback places the shell and is given the shot's spec", () => {
  const dp = new Datapack("art", v1_21_4);
  let seen: unknown;
  dp.ballisticRuntime("throw", {
    ticks: 20,
    shellFunction: (ctx, spec) => {
      seen = spec;
      ctx.tag().add(Selector.allEntities().tag("ammo").limit(1), spec.tags![0]);
    },
  });
  expect(seen).toEqual({ motion: [0, 0, 0], fuse: 20, tags: ["art.shot"] });
  const shot = new Map(buildDatapack(dp)).get(
    "data/art/function/zzzprivate/throw.mcfunction",
  )!;
  expect(shot).not.toContain("summon");
  expect(shot).toContain(
    "execute at @s run tag @e[tag=ammo,limit=1] add art.shot",
  );
});

it("shellTypes types the shot selector for a callback shell", () => {
  const dp = new Datapack("art", v1_21_4);
  const shellFunction = () => {};
  dp.ballisticRuntime("untyped", { shellFunction });
  dp.ballisticRuntime("one", {
    shellFunction,
    shellTypes: [EntityType.ZOMBIE],
  });
  dp.ballisticRuntime("mixed", {
    shellFunction,
    shellTypes: [EntityType.TNT, EntityType.ZOMBIE],
  });
  const files = new Map(buildDatapack(dp));
  const fn = (name: string) =>
    files.get(`data/art/function/zzzprivate/${name}.mcfunction`)!;
  expect(fn("untyped")).toContain(
    "tag @e[tag=art.shot,limit=1] remove art.shot",
  );
  expect(fn("one")).toContain(
    "tag @e[tag=art.shot,limit=1,type=minecraft:zombie] remove art.shot",
  );
  expect(fn("mixed")).toContain(
    "tag @e[tag=art.shot,limit=1,type=#art:ballistics/shot] remove art.shot",
  );
  expect(
    JSON.parse(files.get("data/art/tags/entity_type/ballistics/shot.json")!)
      .values,
  ).toEqual(["minecraft:tnt", "minecraft:zombie"]);
});
