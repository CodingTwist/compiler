import { describe, it, expect } from "vitest";
import {
  mulQuat,
  quat,
  quatFromTo,
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

  it("quatFromTo is the axis-angle you'd have derived by hand", () => {
    // The sword's tilt: a blade pointing straight down, laid out front.
    quatFromTo([0, -1, 0], [0, 0, 1]).forEach((n, i) =>
      expect(n).toBeCloseTo(quat("x", -90)[i], 6),
    );
  });

  it("quatFromTo takes `from` onto `to`, whatever their lengths", () => {
    close(rotateVec([0, -3, 0], quatFromTo([0, -3, 0], [0, 0, 7])), [0, 0, 3]);
  });

  it("quatFromTo of a direction with itself is identity", () => {
    expect(quatFromTo([1, 2, 3], [2, 4, 6]).map(round6)).toEqual([0, 0, 0, 1]);
  });

  it("quatFromTo still turns an antiparallel pair around", () => {
    // No *shortest* rotation exists here, but the one picked must still be a unit
    // quaternion that lands `from` on `to`.
    for (const v of [[0, 1, 0], [1, 0, 0], [0, 0, 1], [1, 1, 1]] as Vec3[]) {
      const flipped = v.map((n) => -n) as Vec3;
      const q = quatFromTo(v, flipped);
      expect(Math.hypot(...q)).toBeCloseTo(1, 6);
      close(rotateVec(v, q), flipped);
    }
  });

  it("mulQuat applies its right operand first", () => {
    // x180 flips [0,1,0] to [0,-1,0], then z90 sends that to [1,0,0].
    close(rotateVec([0, 1, 0], mulQuat(quat("z", 90), quat("x", 180))), [1, 0, 0]);
    // The other order is a different rotation: z90 first gives [-1,0,0], x180 keeps it.
    close(rotateVec([0, 1, 0], mulQuat(quat("x", 180), quat("z", 90))), [-1, 0, 0]);
  });
});
