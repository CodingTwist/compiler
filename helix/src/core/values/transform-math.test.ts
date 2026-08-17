import { describe, it, expect } from "vitest";
import {
  mulQuat,
  quat,
  rotateVec,
  rotateAboutPivot,
  round6,
  Vec3,
} from "./transform-math";

const close = (v: Vec3, e: Vec3) =>
  v.forEach((n, i) => expect(n).toBeCloseTo(e[i], 6));

describe("transform-math", () => {
  it("quat(0) is identity", () => {
    expect(quat("z", 0).map(round6)).toEqual([0, 0, 0, 1]);
  });

  it("quat(z,90) is [0,0,sin45,cos45]", () => {
    const h = Math.SQRT1_2; // sin/cos of 45°
    quat("z", 90).forEach((n, i) => expect(n).toBeCloseTo([0, 0, h, h][i], 6));
  });

  it("rotates +90° about Z: [1,0,0] -> [0,1,0]", () => {
    close(rotateVec([1, 0, 0], quat("z", 90)), [0, 1, 0]);
  });

  it("rotates +90° about X: [0,1,0] -> [0,0,1]", () => {
    close(rotateVec([0, 1, 0], quat("x", 90)), [0, 0, 1]);
  });

  it("rotates +90° about Y: [0,0,1] -> [1,0,0]", () => {
    close(rotateVec([0, 0, 1], quat("y", 90)), [1, 0, 0]);
  });

  it("360° returns to the start (seamless)", () => {
    close(rotateVec([1, 2, 3], quat("z", 360)), [1, 2, 3]);
  });

  it("rotateAboutPivot orbits around a non-origin pivot", () => {
    // A point at the pivot never moves.
    close(rotateAboutPivot([2, 0, 0], [2, 0, 0], quat("z", 123)), [2, 0, 0]);
    // 180° about pivot [1,0,0] sends [2,0,0] to [0,0,0].
    close(rotateAboutPivot([2, 0, 0], [1, 0, 0], quat("z", 180)), [0, 0, 0]);
  });

  it("round6 normalises -0 to 0", () => {
    expect(Object.is(round6(-0), 0)).toBe(true);
  });

  it("mulQuat applies its right operand first", () => {
    // x180 flips [0,1,0] to [0,-1,0], then z90 sends that to [1,0,0].
    close(rotateVec([0, 1, 0], mulQuat(quat("z", 90), quat("x", 180))), [1, 0, 0]);
    // The other order is a different rotation: z90 first gives [-1,0,0], x180 keeps it.
    close(rotateVec([0, 1, 0], mulQuat(quat("x", 180), quat("z", 90))), [-1, 0, 0]);
  });
});
