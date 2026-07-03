// Pure compile-time vector / quaternion math. No Minecraft/version coupling -
// just numbers, vectors and quaternions, evaluated at build time (the runtime
// score-vector equivalents are `Fixed`/`ScoreVec3`). Two concerns share the file:
//   - interpolation (`lerp`/`lerpVec3`) - the value tweening animation bakes with;
//   - rigid-body rotation (`quat`/`rotateVec`/`rotateAboutPivot`) - Minecraft
//     display entities have no transform inheritance, so a multi-block model is
//     spun by transforming each member independently: its world translation is
//     `pivot + rotate(offset - pivot, q)` and its orientation is the same `q`.
// See animated-display.ts.

/** A 3-component vector (translation / scale / offset). */
export type Vec3 = [number, number, number];
/** A quaternion `[x, y, z, w]` (Minecraft's left/right rotation form). */
export type Quat = [number, number, number, number];

export type Axis = "x" | "y" | "z";

const DEG2RAD = Math.PI / 180;

/** Round to 6 dp for stable, readable output, normalising `-0` to `0`. */
export function round6(n: number): number {
  const v = Math.round(n * 1e6) / 1e6;
  return v === 0 ? 0 : v;
}

/** Linear interpolate two numbers: `a` at `u=0`, `b` at `u=1`. */
export function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

/** Component-wise linear interpolate two 3-vectors. */
export function lerpVec3(a: Vec3, b: Vec3, u: number): Vec3 {
  return [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/** Axis-angle (degrees) to a unit quaternion `[x, y, z, w]`. */
export function quat(axis: Axis, angleDeg: number): Quat {
  const half = angleDeg * DEG2RAD * 0.5;
  const s = Math.sin(half);
  const c = Math.cos(half);
  switch (axis) {
    case "x":
      return [s, 0, 0, c];
    case "y":
      return [0, s, 0, c];
    case "z":
      return [0, 0, s, c];
  }
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/** Rotate a vector by a quaternion: `v' = v + 2w(u×v) + 2u×(u×v)`, `u = q.xyz`. */
export function rotateVec(v: Vec3, q: Quat): Vec3 {
  const u: Vec3 = [q[0], q[1], q[2]];
  const w = q[3];
  const t = cross(u, v);
  const t2: Vec3 = [2 * t[0], 2 * t[1], 2 * t[2]];
  const uxt = cross(u, t2);
  return [
    v[0] + w * t2[0] + uxt[0],
    v[1] + w * t2[1] + uxt[1],
    v[2] + w * t2[2] + uxt[2],
  ];
}

/** World position of a member at local `offset` after rotating about `pivot`. */
export function rotateAboutPivot(offset: Vec3, pivot: Vec3, q: Quat): Vec3 {
  return add(pivot, rotateVec(sub(offset, pivot), q));
}
