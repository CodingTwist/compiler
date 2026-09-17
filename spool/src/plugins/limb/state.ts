// The limb's scores: per-leg feet on the body, scratch vectors for the solve.
import { Id, Objective, ScoreTarget, ScoreVec3, Selector } from "helix";
import type { Datapack, Score } from "helix";
import { locator } from "../locator";
import type { LimbOptions } from "./types";

/** Stored units per block. */
export const MM = 1000;
/** Stored units per unit for sines and cosines. */
const UNIT = 10000;

/** Everything the limb's builders share. */
export type LimbState = ReturnType<typeof createState>;

/** Creates the objectives and scratch slots. */
export function createState(dp: Datapack, opts: LimbOptions) {
  const { name } = opts;
  const objectives: Objective[] = [];
  const obj = (short: string) => {
    const o = new Objective(`${name}.${short}`);
    objectives.push(o);
    return o;
  };
  const onSelf = (short: string, scale: number) => obj(short).score(Selector.self()).scaled(scale);
  const selfVec = (short: string) => ScoreVec3.from((a) => obj(`${short}${a}`).score(Selector.self())).scaled(MM);
  const work = obj("work");
  const scalar = (short: string, scale = MM): Score => work.score(ScoreTarget(`#${short}`)).scaled(scale);
  const vector = (short: string) => ScoreVec3.from((a) => work.score(ScoreTarget(`#${short}_${a}`))).scaled(MM);

  const legs = opts.legs.map((_, i) => ({
    foot: selfVec(`l${i}f`),
    from: selfVec(`l${i}s`),
    to: selfVec(`l${i}t`),
    /** Polls left in the current step; 0 when planted. */
    clock: onSelf(`l${i}c`, 1),
  }));

  return {
    dp,
    opts,
    objectives,
    legs,
    body: vector("body"),
    yaw: scalar("yaw"),
    sin: scalar("sin", UNIT),
    cos: scalar("cos", UNIT),
    /** The foot being solved, from the rig's seat on world axes, since bones keep yaw 0. */
    local: vector("local"),
    /** A world point: a rest point being probed. */
    world: vector("world"),
    d: vector("d"),
    w: scalar("w"),
    /** Joints from hip (0) to foot, in the same frame as {@link local}. */
    joints: Array.from({ length: opts.bones.length + 1 }, (_, k) => vector(`j${k}`)),
    /** Legs of each group stepping this poll. */
    stepping: [scalar("g0", 1), scalar("g1", 1)],
    /** Polls each group waits after landing, on the body, so the other group gets the next step. */
    held: [onSelf("h0", 1), onSelf("h1", 1)],
    /** Solved bone frames, by `b<leg>_<bone>`. */
    frames: Id(`${dp.name}:${name}/frames`),
    /** On a body whose feet have been placed once. */
    planted: `${name}.planted`,
    /** On a body that has its bones. */
    boned: `${name}.boned`,
    /** A bone's key in {@link frames}, by leg and index. */
    boneKey: (i: number, k: number) => `b${i}_${k}`,
    boneTag: (i: number, k: number) => `${name}.b${i}_${k}`,
    locator: locator(dp),
  };
}
