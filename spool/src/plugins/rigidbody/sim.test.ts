// Drops a body in the interpreted world and checks it lands, slides and bounces sensibly.
import { describe, expect, it } from "vitest";
import { Datapack, quat, v26_3_rc_2 } from "helix";
import { installKit } from "../../kit";
import { rigidbody } from ".";
import { FLOOR, Sim, WALL } from "./mcsim.test-util";

installKit([rigidbody]);

/** Seeds one body the way `spawn` does, then steps it until it sleeps or `ticks` run out. */
function drop(opts: { y: number; rotation: [number, number, number, number]; spin?: [number, number, number]; vel?: [number, number, number]; ticks: number }) {
  const dp = new Datapack("test", v26_3_rc_2);
  dp.rigidbody();
  dp.report();
  const sim = new Sim(dp.files);
  const [x, y, z, w] = opts.rotation;
  const self = (o: string, v: number) => sim.set("@s", o, v);
  [["px", 500], ["py", Math.round(opts.y * 1000)], ["pz", 500], ["vx", opts.vel?.[0] ?? 0], ["vy", opts.vel?.[1] ?? 0], ["vz", opts.vel?.[2] ?? 0]].forEach(([o, v]) => self(`rb.${o}`, v as number));
  ["x", "y", "z"].forEach((a, i) => self(`rb.w${a}`, opts.spin?.[i] ?? 0));
  self("rb.qw", Math.round(w * 10000));
  [x, y, z].forEach((q, i) => self(`rb.q${"xyz"[i]}`, Math.round(q * 10000)));
  self("rb.half", 500);
  self("rb.im", 800);
  self("rb.ii", 200);
  self("rb.motion", 10000);
  const trace: number[] = [];
  const xs: number[] = [];
  let tick = 0;
  for (; tick < opts.ticks && sim.get("@s", "rb.sleep") === 0; tick++) {
    sim.call("rb/step");
    trace.push(sim.get("@s", "rb.py"));
    xs.push(sim.get("@s", "rb.px"));
  }
  const q = ["qw", "qx", "qy", "qz"].map((o) => sim.get("@s", `rb.${o}`) / 10000);
  return { sim, tick, trace, xs, q, pos: ["px", "py", "pz"].map((o) => sim.get("@s", `rb.${o}`)) };
}

/** How far the cube is from resting on a face: 0 when some local axis points straight up. */
function tiltFromFlat([w, i, j, k]: number[]): number {
  // World-y component of each local axis (the rotation matrix's middle row).
  const up = [2 * (i * j + k * w), 1 - 2 * (i * i + k * k), 2 * (j * k - i * w)];
  return 1 - Math.max(...up.map(Math.abs));
}

describe("rigidbody on a flat floor (emitted commands, interpreted)", () => {
  it("lands a level cube on the floor and sleeps", () => {
    const r = drop({ y: 66.5, rotation: [0, 0, 0, 1], ticks: 400 });
    expect(r.sim.wraps).toBe(0);
    expect(r.sim.get("@s", "rb.sleep")).toBe(1);
    // Centre half a block above the floor, within the slop.
    expect(Math.abs(r.pos[1] - (FLOOR * 1000 + 500))).toBeLessThanOrEqual(25);
  });

  it("tumbles a tilted, spinning cube flat without sinking or exploding", () => {
    const r = drop({ y: 67, rotation: mul(quat("x", 35), quat("z", 20)), spin: [4000, 0, 2500], ticks: 600 });
    expect(r.sim.wraps).toBe(0);
    expect(Math.min(...r.trace)).toBeGreaterThan(FLOOR * 1000 + 400);
    expect(Math.hypot(...r.q)).toBeCloseTo(1, 2);
    expect(r.sim.get("@s", "rb.sleep")).toBe(1);
    expect(tiltFromFlat(r.q)).toBeLessThan(0.02);
    expect(Math.abs(r.pos[1] - (FLOOR * 1000 + 500))).toBeLessThanOrEqual(40);
  });

  it("slides to a stop on friction", () => {
    const r = drop({ y: 64.5, rotation: [0, 0, 0, 1], vel: [0, 0, 150], ticks: 400 });
    expect(r.sim.wraps).toBe(0);
    expect(r.sim.get("@s", "rb.sleep")).toBe(1);
    expect(tiltFromFlat(r.q)).toBeLessThan(0.02);
    // Friction 0.8 against gravity 49 stops 150 mm/tick within a few blocks.
    expect(Math.abs(r.pos[2] - 500)).toBeLessThan(3000);
  });

  it("bounces off a wall instead of passing through it", () => {
    const r = drop({ y: 64.5, rotation: [0, 0, 0, 1], vel: [800, 0, 0], ticks: 400 });
    expect(r.sim.wraps).toBe(0);
    // It reaches the wall, and its +x face never goes more than the slop past x = 3.
    expect(Math.max(...r.xs)).toBeGreaterThan(WALL * 1000 - 700);
    expect(Math.max(...r.xs)).toBeLessThanOrEqual(WALL * 1000 - 500 + 120);
    expect(r.sim.get("@s", "rb.sleep")).toBe(1);
  });
});

function mul(a: number[], b: number[]): [number, number, number, number] {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}
