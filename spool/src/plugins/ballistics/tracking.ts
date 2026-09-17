import { Datapack, Path, Range, ScoreVec3, Selector } from "helix";
import type { FunctionRef, Objective } from "helix";
import { AXES, OBJECTIVE, POS_SCALE } from "./constants";

/**
 * Tracks player velocity so shots can lead moving targets.
 *
 * Players have no readable `Motion`, so velocity is this tick's position minus last tick's.
 * Only players recently shot at are tracked, and it's emitted once per pack.
 */

/** Players currently being diffed. Enrolment is by shot, not by being online. */
const TRACK_TAG = "ballistics.tracked";

/** Ticks a target stays tracked after the last shot. Longer than any reasonable reload. */
const TRACK_TTL = 200;

export interface Tracker {
  /** Per-axis velocity in centi-blocks/tick, keyed by player. */
  readonly vel: Objective[];
  /** Run as a target to (re)enrol it. Idempotent; refreshes the timeout. */
  readonly enroll: FunctionRef;
}

/** One tracker per datapack, whatever asks for it. */
const trackers = new WeakMap<Datapack, Tracker>();

export function targetVelocity(caller: Datapack): Tracker {
  const existing = trackers.get(caller.root);
  if (existing) return existing;
  const dp = caller.root.plugin("ballistics");

  const vel = AXES.map((a) => dp.objective(`${OBJECTIVE}.v${a}`));
  const prev = AXES.map((a) => dp.objective(`${OBJECTIVE}.p${a}`));
  const ttl = dp.objective(`${OBJECTIVE}.ttl`);
  const me = () => Selector.self();
  /** The three objectives as one `@s`-bound vector. */
  const vec = (o: Objective[]) => ScoreVec3.from((_, i) => o[i].score(me()));

  // Seed the previous position on enrol, or a returning player's first diff would be huge.
  const init = dp.createFunction("track_init");
  init.build((ctx) => {
    vec(prev).readEntity(me(), Path.Entity.Pos, POS_SCALE, { ctx });
    for (const axis of vec(vel).components) axis.set(0);
  });

  const enroll = dp.createFunction("track_enroll");
  enroll.build((ctx) => {
    ctx
      .execute()
      .unlessEntity(me().tag(TRACK_TAG))
      .run((c) => c.call(init));
    ctx.tag().add(me(), TRACK_TAG);
    ttl.score(me()).set(TRACK_TTL);
  });

  const track = dp.createFunction("track_targets");
  track.build((ctx) => {
    // Subtract before overwriting the previous position.
    const v = vec(vel);
    const then = vec(prev);
    v.readEntity(me(), Path.Entity.Pos, POS_SCALE, { ctx }).sub(then, ctx);
    then.readEntity(me(), Path.Entity.Pos, POS_SCALE, { ctx });
    // Nobody has shot at them in a while - stop paying for them.
    const left = ttl.score(me());
    left.remove(1);
    ctx
      .execute()
      .ifScoreMatches(left, new Range(undefined, 0))
      .run((c) => c.tag().remove(me(), TRACK_TAG));
  });
  dp.tick((ctx) =>
    ctx
      .execute()
      .as(Selector.allPlayers().tag(TRACK_TAG))
      .run((c) => c.call(track)),
  );

  const tracker: Tracker = { vel, enroll };
  trackers.set(caller.root, tracker);
  return tracker;
}
