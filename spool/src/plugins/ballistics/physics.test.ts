import { describe, expect, it } from "vitest";
import { installKit } from "../../kit";
import { ballistics } from "./index";
import { closestApproach, sampleAt, simulate, trajectoryBasis } from "./physics";
import { PROJECTILES } from "./projectiles";

installKit([ballistics]);

const TNT = PROJECTILES.tnt;

describe("physics", () => {
  it("integrates TNT in vanilla's order: gravity, move, drag", () => {
    // Launched flat at 1 block/tick east. Tick 1 applies gravity before moving, and drag
    // not yet.
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
    // Stored velocity settles at -1.96, but gravity applies before the move, so the fall
    // rate is -2.
    const path = simulate([0, 0, 0], [0, 0, 0], TNT, 1200);
    expect(path[1199][1] - path[1198][1]).toBeCloseTo(-2.0, 6);
  });

  it("reaches a living entity's terminal fall rate: -3.92 blocks/tick", () => {
    // Living entities apply gravity before drag, so stored velocity equals the fall rate.
    const path = simulate([0, 0, 0], [0, 0, 0], PROJECTILES.living, 1200);
    expect(path[1199][1] - path[1198][1]).toBeCloseTo(-3.92, 6);
  });

  it("drags a living entity's horizontal axis harder than its vertical one", () => {
    // 0.91 against 0.98: after one tick the x velocity has lost 9%, not 2%.
    const path = simulate([0, 0, 0], [1, 0, 0], PROJECTILES.living, 2);
    expect(path[2][0] - path[1][0]).toBeCloseTo(0.91, 12);
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

  it("splits the basis per axis when the drag is anisotropic", () => {
    const { A, Ay, G } = trajectoryBasis(PROJECTILES.living, 60);
    expect(Ay[30]).not.toBeCloseTo(A[30], 3);
    const v: [number, number, number] = [0.8, 1.3, -0.45];
    const path = simulate([10, 70, -5], v, PROJECTILES.living, 60);
    for (let n = 0; n <= 60; n++) {
      expect(10 + v[0] * A[n]).toBeCloseTo(path[n][0], 9);
      expect(70 + v[1] * Ay[n] + G[n]).toBeCloseTo(path[n][1], 9);
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
    // Passes the target between two tick samples; segment distance must still count it as a
    // hit.
    const path = simulate([0, 0, 0], [4, 0, 0], TNT, 3);
    const mid = path[1].map((c, i) => (c + path[2][i]) / 2) as [number, number, number];
    expect(mid[0]).toBeGreaterThan(path[1][0] + 1); // genuinely far from either tick sample
    const hit = closestApproach(path, mid);
    expect(hit.tick).toBeCloseTo(1.5, 6);
    expect(hit.distance).toBeLessThan(1e-12);
  });
});
