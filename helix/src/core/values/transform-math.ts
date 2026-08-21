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

/**
 * Compose two rotations: `b` is applied **first**, then `a` - the same order as
 * writing `a * b`. `quat` is single-axis, so this is how a transform gets a second
 * axis without burning the display's other rotation slot.
 */
export function mulQuat(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len === 0) throw new Error("Cannot normalise a zero-length direction.");
  return [v[0] / len, v[1] / len, v[2] / len];
}

/**
 * The shortest rotation taking direction `from` onto direction `to` - a pose stated as
 * an *intent* ("aim the down-pointing blade out front") rather than a hand-derived axis
 * and angle. Neither input has to be unit length; neither may be zero.
 *
 * The antiparallel case has no shortest rotation (every half-turn about a perpendicular
 * axis works), so one perpendicular is picked.
 */
export function quatFromTo(from: Vec3, to: Vec3): Quat {
  const a = normalize(from);
  const b = normalize(to);
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (d > 1 - 1e-6) return [0, 0, 0, 1];
  if (d < -1 + 1e-6) {
    // Any axis perpendicular to `a`: cross it with whichever principal axis it is
    // least aligned with, which can never itself be parallel.
    const least: Vec3 =
      Math.abs(a[0]) <= Math.abs(a[1]) && Math.abs(a[0]) <= Math.abs(a[2])
        ? [1, 0, 0]
        : Math.abs(a[1]) <= Math.abs(a[2])
          ? [0, 1, 0]
          : [0, 0, 1];
    const [x, y, z] = normalize(cross(a, least));
    return [x, y, z, 0];
  }
  const [x, y, z] = cross(a, b);
  const w = 1 + d;
  const len = Math.hypot(x, y, z, w);
  return [x / len, y / len, z / len, w / len];
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
