import { describe, expect, it } from "vitest";
import { installKit } from "../../kit";
import { ballistics } from "./index";
import { PROJECTILES } from "./projectiles";
import { solveLaunch } from "./solve";

installKit([ballistics]);

const TNT = PROJECTILES.tnt;

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

  it("solves a living entity exactly, anisotropic drag and all", () => {
    const mob = solveLaunch([0, 64, 0], [40, 70, -12], { projectile: PROJECTILES.living });
    // Checked against the real integrator: a mob with this Motion lands on the target.
    expect(mob.error).toBeLessThan(1e-9);
    expect(mob.speed).not.toBeCloseTo(
      solveLaunch([0, 64, 0], [40, 70, -12], { projectile: PROJECTILES.tnt }).speed,
      3,
    );
  });
});
