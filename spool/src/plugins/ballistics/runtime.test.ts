import { describe, expect, it } from "vitest";
import { Datapack, Selector, buildDatapack, v1_21_4, type Vec3 } from "helix";
import { installKit } from "../../kit";
import { ballistics, type RuntimeShotOptions } from "./index";
import { PROJECTILES, closestApproach, simulate, trajectoryBasis } from "./physics";

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
 * Re-run the *integer* arithmetic the emitted function performs, so the check measures
 * the datapack's real answer (truncation and all), not the float solve it is derived
 * from. Mirrors the command sequence in `runtime.ts` one for one.
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
    // A(40) = 27.6, so the constants baked in are the basis at exactly that tick.
    const { A, G } = trajectoryBasis(TNT, 40);
    expect(lines).toContain(`scoreboard players set #a ballistics ${Math.round(A[40] * 100)}`);
    expect(lines).toContain("scoreboard players set #v_scale ballistics 10000");
    // Gravity comes out of the vertical axis before the divide; G(40) is negative.
    expect(G[40]).toBeLessThan(0);
    expect(lines).toContain(`scoreboard players add #vy ballistics ${-Math.round(G[40] * 100)}`);

    for (const axis of [0, 1, 2]) {
      const v = ["#vx", "#vy", "#vz"][axis];
      expect(lines).toContain(
        `execute at @e[tag=gun,limit=1] store result score ${v} ballistics ` +
          `run data get entity @e[tag=mark,limit=1] Pos[${axis}] 100`,
      );
      const p = ["#px", "#py", "#pz"][axis];
      expect(lines).toContain(
        `execute store result score ${p} ballistics run data get entity @e[tag=gun,limit=1] Pos[${axis}] 100`,
      );
      expect(lines).toContain(
        `execute store result entity @e[tag=art.shot,limit=1] Motion[${axis}] double 0.0001 ` +
          `run scoreboard players get ${v} ballistics`,
      );
    }
    // Summoned at the launcher, fused to airburst on arrival, tagged only long enough
    // to have its Motion written.
    expect(lines.some((l) => l.startsWith("execute at @e[tag=gun,limit=1] run summon minecraft:tnt ~ ~ ~ "))).toBe(true);
    expect(lines.some((l) => l.includes("fuse:40s"))).toBe(true);
    expect(lines).toContain("tag @e[tag=art.shot,limit=1] remove art.shot");
    // Nothing is fired unless every axis is inside vanilla's +/-10 Motion limit; the
    // caller learns which happened from the return value.
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
    // `at @s` first, so `@p` is the *thrower's* nearest player.
    expect(lines).toContain(
      "execute at @s store result score #vx ballistics run data get entity @p Pos[0] 100",
    );
    expect(lines.some((l) => l.startsWith("execute at @s run summon"))).toBe(true);
  });

  it("lead adds one shared per-tick tracker and aims ahead of the target", () => {
    const dp = new Datapack("art", v1_21_4);
    dp.ballisticRuntime("a", { lead: true, ticks: 30 });
    dp.ballisticRuntime("b", { lead: true, ticks: 60 });
    const files = [...buildDatapack(dp)].filter(([p]) => p.endsWith(".mcfunction"));
    const lines = files.flatMap(([, b]) => b.split("\n")).filter((l) => l.length > 0);

    // Emitted once, however many shots ask for it.
    expect(files.filter(([p]) => p.includes("track_targets"))).toHaveLength(1);
    expect(lines.filter((l) => l.includes("run function art:zzz/track_targets"))).toHaveLength(1);
    // Only players under fire are diffed, and firing is what enrols them.
    expect(lines).toContain(
      "execute as @a[tag=ballistics.tracked] run function art:zzz/track_targets",
    );
    expect(lines).toContain("execute at @s as @p run function art:zzz/track_enroll");
    expect(lines).toContain("tag @s add ballistics.tracked");
    // A cold (or re-)enrolment reseeds prev, so the first diff can't be against a
    // position from a previous engagement.
    expect(lines).toContain(
      "execute unless entity @s[tag=ballistics.tracked] run function art:zzz/track_init",
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
    // Target point is displaced by velocity x flight time before the solve.
    expect(lines).toContain("scoreboard players set #ticks ballistics 30");
    expect(lines).toContain(
      "execute at @s run scoreboard players operation #px ballistics = @p ballistics.vx",
    );
    expect(lines).toContain("scoreboard players operation #px ballistics *= #ticks ballistics");
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
