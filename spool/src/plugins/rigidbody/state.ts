// Objectives, per-body vectors, scratch slots and the function table the engine shares.
import { EntityType, Id, Objective, ScoreTarget, ScoreVec3, Selector } from "helix";
import type { Datapack, Score } from "helix";

/** Positions and velocities are millimetres (per tick). */
export const MM = 1000;
/** Quaternion components are stored ×10000; ×1000 wobbles visibly as it drifts. */
export const Q = 10000;
/**
 * Angular velocity is stored in 1e-5 rad/tick. Milliradians truncate a nearly balanced cube's
 * small tipping torque to zero, so it freezes on an edge.
 */
export const W = 100000;
/** Converts `r × impulse` (mm · mm/tick, inverse inertia ×1000) into a spin change in W units. */
export const SPIN_PER_TORQUE = W / 1e9;
/** One fixed contact slot per cube vertex, so no contact list is kept. */
export const VERTICES = 8;

/** Everything the engine's builders share - whatever {@link createState} returns. */
export type RigidState = ReturnType<typeof createState>;

/** Creates the objectives, selectors, scratch slots and functions, up front so bodies can call each other. */
export function createState(dp: Datapack) {
  const self = () => Selector.self();
  const bodies = () => Selector.allEntities().type(EntityType.ITEM_DISPLAY).tag("rb.body");
  const probe = () => Selector.uuid(PROBE_UUID);

  const obj = (name: string) => new Objective(`rb.${name}`);
  const onSelf = (name: string) => obj(name).score(self());
  const selfVec = (name: string) =>
    ScoreVec3.from((axis) => obj(`${name}${axis}`).score(self()));

  const body = {
    pos: selfVec("p"),
    vel: selfVec("v"),
    /** Angular velocity in {@link W} units. */
    spin: selfVec("w"),
    qw: onSelf("qw"),
    /** The quaternion's vector part (i, j, k). */
    qv: selfVec("q"),
    /** Half the edge length, in mm. */
    half: onSelf("half"),
    /** Inverse mass ×1000. */
    invMass: onSelf("im"),
    /** Inverse rotational inertia ×1000 (a cube's inertia is the same about every axis). */
    invInertia: onSelf("ii"),
    sleeping: onSelf("sleep"),
    /** Decaying sum of recent |v|² + |ω|², for the sleep check. */
    motion: onSelf("motion"),
  };

  const work = new Objective("rb.work");
  const scalar = (name: string): Score => work.score(ScoreTarget(`#${name}`));
  const vector = (name: string) =>
    ScoreVec3.from((axis) => scalar(`${name}_${axis}`));

  /**
   * Contact slot `i`: hit flag, world point and lever arm (mm), normal (×1000), depth (mm),
   * effective mass along the normal (×1000), bounce target, and the impulses accumulated so far.
   */
  const contact = (i: number) => ({
    hit: scalar(`c${i}.hit`),
    point: vector(`c${i}.p`),
    r: vector(`c${i}.r`),
    normal: vector(`c${i}.n`),
    depth: scalar(`c${i}.d`),
    kn: scalar(`c${i}.kn`),
    target: scalar(`c${i}.target`),
    acc: scalar(`c${i}.acc`),
    friction: vector(`c${i}.f`),
  });

  const objectives = [
    work,
    ...[body.pos, body.vel, body.spin, body.qv].flatMap((v) =>
      v.components.map((s) => s.objective),
    ),
    ...[body.qw, body.half, body.invMass, body.invInertia, body.sleeping, body.motion].map(
      (s) => s.objective,
    ),
  ];

  const fn = {
    init: dp.createFunction("rb/init", "load"),
    tick: dp.createFunction("rb/tick", "tick"),
    step: dp.createFunction("rb/step"),
    impulse: dp.createFunction("rb/impulse"),
    solvePass: dp.createFunction("rb/solve/pass"),
    contacts: Array.from({ length: VERTICES }, (_, i) => ({
      detect: dp.createFunction(`rb/contact/detect_${i}`),
      solve: dp.createFunction(`rb/contact/solve_${i}`),
    })),
  };

  return {
    dp,
    self,
    bodies,
    probe,
    body,
    work,
    scalar,
    vector,
    contact,
    objectives,
    fn,
    /** Render buffer, so each body costs two entity writes instead of seven. */
    render: Id(`${dp.name}:rb/render`),
  };
}

/** The shared probe marker that visits each vertex so blocks can be tested there. */
export const PROBE_UUID = "7262-0-0-0-1";
export const PROBE_UUID_INTS: [number, number, number, number] = [0x7262, 0, 0, 1];
