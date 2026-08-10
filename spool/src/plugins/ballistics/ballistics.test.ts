import { describe, expect, it } from "vitest";
import { Datapack, v1_21_4 } from "helix";
import { installKit } from "../../kit";
import { ballistics } from "./index";
import { PROJECTILES, closestApproach, sampleAt, simulate, trajectoryBasis } from "./physics";
import { solveLaunch } from "./solve";

installKit([ballistics]);

const TNT = PROJECTILES.tnt;

describe("physics", () => {
  it("integrates TNT in vanilla's order: gravity, move, drag", () => {
    // Launched flat at 1 block/tick east from the origin. Tick 1: gravity first
    // (vy = -0.04), then the move, so y = -0.04 and x = 1 (drag has not applied yet).
    const path = simulate([0, 0, 0], [1, 0, 0], TNT, 2);
    expect(path[1]).toEqual([1, -0.04, 0]);
    // Tick 2: velocity is now (0.98, -0.0392) and gravity adds another -0.04 first.
    expect(path[2][0]).toBeCloseTo(1.98, 12);
    expect(path[2][1]).toBeCloseTo(-0.04 + (-0.0392 - 0.04), 12);
  });

  it("puts gravity after the move for arrows", () => {
    // Same launch, arrow rules: the first tick moves before gravity is applied at all.
    expect(simulate([0, 0, 0], [1, 0, 0], PROJECTILES.arrow, 1)[1]).toEqual([1, 0, 0]);
  });

  it("reaches TNT's terminal fall rate: -1.96 stored, -2.0 blocks/tick observed", () => {
    // Drag pulls the stored velocity to -g·d/(1-d) = -1.96, but gravity is applied before
    // the move, so each tick actually displaces that plus one more gravity step.
    const path = simulate([0, 0, 0], [0, 0, 0], TNT, 1200);
    expect(path[1199][1] - path[1198][1]).toBeCloseTo(-2.0, 6);
  });

  it("basis decomposition reproduces a directly simulated trajectory", () => {
    const { A, G } = trajectoryBasis(TNT, 60);
    const v: [number, number, number] = [0.8, 1.3, -0.45];
    const path = simulate([10, 70, -5], v, TNT, 60);
    for (let n = 0; n <= 60; n++) {
      expect(10 + v[0] * A[n]).toBeCloseTo(path[n][0], 9);
      expect(70 + v[1] * A[n] + G[n]).toBeCloseTo(path[n][1], 9);
      expect(-5 + v[2] * A[n]).toBeCloseTo(path[n][2], 9);
    }
  });

  it("interpolates the basis along the segment the game actually sweeps", () => {
    const { A } = trajectoryBasis(TNT, 10);
    const path = simulate([0, 0, 0], [1, 0, 0], TNT, 10);
    // Half way through tick 3 the entity is half way along the straight move 3 -> 4.
    expect(sampleAt(A, 3.5)).toBeCloseTo((path[3][0] + path[4][0]) / 2, 12);
  });

  it("finds a crossing between ticks, not just the nearest tick sample", () => {
    // 4 blocks/tick east: the target at x=6 is passed mid-tick, 2 blocks from either
    // tick sample. Segment distance must see it as a direct hit.
    const path = simulate([0, 0, 0], [4, 0, 0], TNT, 3);
    const mid = path[1].map((c, i) => (c + path[2][i]) / 2) as [number, number, number];
    expect(mid[0]).toBeGreaterThan(path[1][0] + 1); // genuinely far from either tick sample
    const hit = closestApproach(path, mid);
    expect(hit.tick).toBeCloseTo(1.5, 6);
    expect(hit.distance).toBeLessThan(1e-12);
  });
});

describe("solveLaunch", () => {
  it("hits the target to round-off, verified against the real integrator", () => {
    for (const to of [
      [40, 64, 0],
      [-30, 90, 55],
      [120, 20, -75],
      [0, 100, 0], // straight up: no horizontal direction to recover
    ] as [number, number, number][]) {
      const shot = solveLaunch([0, 64, 0], to);
      expect(shot.error).toBeLessThan(1e-9);
      expect(shot.impactTick).toBeCloseTo(shot.ticks, 9);
    }
  });

  it("reports Minecraft's yaw/pitch convention (0 = +Z, negative pitch = up)", () => {
    // Due south and slightly up: yaw 0, pitch negative.
    const south = solveLaunch([0, 64, 0], [0, 70, 40]);
    expect(south.yaw).toBeCloseTo(0, 6);
    expect(south.pitch).toBeLessThan(0);
    // Due east is yaw -90.
    expect(solveLaunch([0, 64, 0], [40, 64, 0]).yaw).toBeCloseTo(-90, 6);
    // The reported angles must reconstruct the velocity they came from.
    const y = (south.yaw * Math.PI) / 180;
    const p = (south.pitch * Math.PI) / 180;
    expect(-Math.sin(y) * Math.cos(p) * south.speed).toBeCloseTo(south.velocity[0], 9);
    expect(-Math.sin(p) * south.speed).toBeCloseTo(south.velocity[1], 9);
    expect(Math.cos(y) * Math.cos(p) * south.speed).toBeCloseTo(south.velocity[2], 9);
  });

  it("honours the speed budget, the pitch range and the preference", () => {
    const target: [number, number, number] = [60, 64, 0];
    const cheap = solveLaunch([0, 64, 0], target);
    const fast = solveLaunch([0, 64, 0], target, { prefer: "min-time" });
    expect(cheap.speed).toBeLessThan(fast.speed);
    expect(fast.ticks).toBeLessThan(cheap.ticks);

    const lob = solveLaunch([0, 64, 0], target, { pitchRange: [-90, -30] });
    expect(lob.pitch).toBeLessThanOrEqual(-30);
    expect(lob.error).toBeLessThan(1e-9);

    const capped = solveLaunch([0, 64, 0], target, { maxSpeed: 2.5 });
    expect(capped.speed).toBeLessThanOrEqual(2.5);
  });

  it("throws with a reachable-speed diagnostic when nothing fits", () => {
    expect(() => solveLaunch([0, 64, 0], [4000, 64, 0], { maxSpeed: 1 })).toThrow(
      /no launch from .* blocks\/tick/,
    );
  });

  it("solves whole ticks by default so a fuse airburst is exact", () => {
    expect(solveLaunch([0, 64, 0], [73, 88, -19]).ticks % 1).toBe(0);
    expect(solveLaunch([0, 64, 0], [73, 88, -19], { subTickSamples: 4 }).ticks % 0.25).toBe(0);
  });

  it("models each projectile's own constants", () => {
    const tnt = solveLaunch([0, 64, 0], [40, 64, 0], { projectile: PROJECTILES.tnt, minTicks: 30, maxTicks: 30 });
    const arrow = solveLaunch([0, 64, 0], [40, 64, 0], { projectile: PROJECTILES.arrow, minTicks: 30, maxTicks: 30 });
    // Same shot, different drag and gravity, so a different launch vector is required.
    expect(arrow.speed).not.toBeCloseTo(tnt.speed, 3);
    expect(arrow.error).toBeLessThan(1e-9);
  });
});

describe("ctx.ballistic", () => {
  it("emits a summon whose Motion is the solved velocity, fused to airburst", () => {
    const dp = new Datapack("cannon", v1_21_4);
    let shot!: ReturnType<typeof solveLaunch>;
    dp.createFunction("fire").build((ctx) => {
      shot = ctx.ballistic([0.5, 70, 0.5], [80.5, 64, 20.5], { maxSpeed: 3 });
    });
    dp.report(); // populate dp.files
    const cmd = dp.files.get("fire")!;
    expect(cmd).toContain("summon minecraft:tnt 0.5 70 0.5");
    // `fuse` since 1.20.3; older profiles get `Fuse`, which the schema handles.
    expect(cmd).toContain(`fuse:${Math.round(shot.ticks)}s`);
    expect(cmd).toMatch(/Motion:\[-?\d+\.\d+d,-?\d+\.\d+d,-?\d+\.\d+d\]/);
    expect(shot.error).toBeLessThan(1e-9);
  });

  it("merges extra nbt and can leave the fuse alone", () => {
    const dp = new Datapack("cannon", v1_21_4);
    dp.createFunction("fire").build((ctx) => {
      ctx.ballistic([0, 70, 0], [40, 64, 0], { fuse: false, nbt: { Tags: ["shell"] } });
    });
    dp.report(); // populate dp.files
    const cmd = dp.files.get("fire")!;
    expect(cmd).not.toContain("fuse:");
    expect(cmd).toContain('Tags:["shell"]');
  });
});
