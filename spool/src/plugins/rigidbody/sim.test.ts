// Drops bodies in the helix simulator and checks they land, slide, bounce and stack sensibly.
import { describe, expect, it } from "vitest";
import { Datapack, Item, Sim, buildDatapack, quat, v26_3_rc_2 } from "helix";
import type { Quat } from "helix";
import { installKit } from "../../kit";
import { rigidbody } from ".";

installKit([rigidbody]);

type V3 = [number, number, number];
interface BodyInit { at: V3; rotation?: Quat; spin?: V3; vel?: V3 }

/** Top of the floor: every block below y=64 is solid. */
const FLOOR = 64;
/** A wall: every block at x ≥ 3 is solid. */
const WALL = 3;

/** Builds the pack, spawns each body with its own spawn function, and gives it a starting push. */
function world(...bodies: BodyInit[]) {
  const dp = new Datapack("test", v26_3_rc_2);
  const rb = dp.rigidbody();
  bodies.forEach((b, n) => dp.createFunction(`spawn_${n}`).build((ctx) => rb.spawn(ctx, { item: Item.STONE, rotation: b.rotation })));
  const sim = new Sim(buildDatapack(dp), {
    block: (x, y) => (y < FLOOR || x >= WALL ? "minecraft:stone" : "minecraft:air"),
    blockTags: { "minecraft:air": ["minecraft:air"] },
  });
  sim.load();
  const ids = bodies.map((b, n) => {
    sim.run(`execute positioned ${b.at.join(" ")} run function test:spawn_${n}`);
    const body = sim.entities.at(-1)!;
    "xyz".split("").forEach((a, i) => {
      sim.setScore(body.uuid, `rb.v${a}`, b.vel?.[i] ?? 0);
      sim.setScore(body.uuid, `rb.w${a}`, b.spin?.[i] ?? 0);
    });
    return body.uuid;
  });
  const get = (id: string, o: string) => sim.score(id, o) ?? 0;
  const pos = (id: string) => ["px", "py", "pz"].map((a) => get(id, `rb.${a}`) / 1000) as V3;
  const asleep = () => ids.every((id) => get(id, "rb.sleep") === 1);
  const trace: V3[][] = [];
  const run = (ticks: number) => {
    for (let i = 0; i < ticks && !asleep(); i++) {
      sim.tick();
      trace.push(ids.map(pos));
    }
  };
  const q = (n: number) => ["qw", "qx", "qy", "qz"].map((o) => get(ids[n], `rb.${o}`) / 10000);
  return { sim, run, asleep, trace, q, pos: (n: number) => pos(ids[n]) };
}

/** How far the cube is from resting on a face: 0 when some local axis points straight up. */
function tiltFromFlat([w, i, j, k]: number[]): number {
  const up = [2 * (i * j + k * w), 1 - 2 * (i * i + k * k), 2 * (j * k - i * w)];
  return 1 - Math.max(...up.map(Math.abs));
}

const REST = FLOOR + 0.5;

describe("rigidbody on a flat floor (emitted commands, interpreted)", () => {
  it("lands a level cube on the floor and sleeps", () => {
    const w = world({ at: [0.5, 66.5, 0.5] });
    w.run(400);
    expect(w.sim.errors).toEqual([]);
    expect(w.asleep()).toBe(true);
    expect(Math.abs(w.pos(0)[1] - REST)).toBeLessThanOrEqual(0.025);
  });

  it("tumbles a tilted, spinning cube flat without sinking or exploding", () => {
    const w = world({ at: [0.5, 67, 0.5], rotation: mul(quat("x", 35), quat("z", 20)), spin: [4000, 0, 2500] });
    w.run(600);
    expect(w.sim.errors).toEqual([]);
    expect(Math.min(...w.trace.map((t) => t[0][1]))).toBeGreaterThan(FLOOR + 0.4);
    expect(Math.hypot(...w.q(0))).toBeCloseTo(1, 2);
    expect(w.asleep()).toBe(true);
    expect(tiltFromFlat(w.q(0))).toBeLessThan(0.02);
    expect(Math.abs(w.pos(0)[1] - REST)).toBeLessThanOrEqual(0.04);
  });

  it("slides to a stop on friction", () => {
    const w = world({ at: [0.5, REST, 0.5], vel: [0, 0, 150] });
    w.run(400);
    expect(w.sim.errors).toEqual([]);
    expect(w.asleep()).toBe(true);
    expect(tiltFromFlat(w.q(0))).toBeLessThan(0.02);
    expect(Math.abs(w.pos(0)[2] - 0.5)).toBeLessThan(3);
  });

  it("bounces off a wall instead of passing through it", () => {
    const w = world({ at: [0.5, REST, 0.5], vel: [800, 0, 0] });
    w.run(400);
    const xs = w.trace.map((t) => t[0][0]);
    expect(w.sim.errors).toEqual([]);
    // It reaches the wall, and its +x face never goes more than the slop past x = 3.
    expect(Math.max(...xs)).toBeGreaterThan(WALL - 0.7);
    expect(Math.max(...xs)).toBeLessThanOrEqual(WALL - 0.5 + 0.12);
    expect(w.asleep()).toBe(true);
  });
});

describe("rigidbody against other bodies (emitted commands, interpreted)", () => {
  it("stacks a cube on another and both sleep", () => {
    const w = world({ at: [0.5, REST, 0.5] }, { at: [0.5, REST + 1.5, 0.5] });
    w.run(400);
    expect(w.sim.errors).toEqual([]);
    expect(w.asleep()).toBe(true);
    expect(Math.abs(w.pos(0)[1] - REST)).toBeLessThanOrEqual(0.04);
    expect(Math.abs(w.pos(1)[1] - (REST + 1))).toBeLessThanOrEqual(0.04);
    expect(tiltFromFlat(w.q(1))).toBeLessThan(0.01);
  });

  it("drops a tilted cube onto another's corner without passing through", () => {
    const w = world({ at: [0.5, REST, 0.5] }, { at: [1.1, REST + 2, 0.8], rotation: mul(quat("x", 35), quat("z", 20)) });
    w.run(600);
    expect(w.sim.errors).toEqual([]);
    expect(w.asleep()).toBe(true);
    // Settled cubes are nearly axis-aligned, so they overlap unless apart on some axis.
    const gap = Math.max(...w.pos(0).map((p, i) => Math.abs(p - w.pos(1)[i])));
    expect(gap).toBeGreaterThan(0.9);
    expect(tiltFromFlat(w.q(1))).toBeLessThan(0.02);
    expect(Math.min(...w.trace.map((t) => t[1][1]))).toBeGreaterThan(FLOOR + 0.4);
  });

  it("pushes a resting cube when another slides into it", () => {
    const w = world({ at: [0.5, REST, 0.5], vel: [300, 0, 0] }, { at: [1.8, REST, 0.5] });
    w.run(400);
    expect(w.sim.errors).toEqual([]);
    expect(w.pos(1)[0]).toBeGreaterThan(1.9);
    expect(w.pos(1)[0] - w.pos(0)[0]).toBeGreaterThan(0.9);
  });
});

function mul(a: number[], b: number[]): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}
