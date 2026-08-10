import { Datapack, Path, Range, ScoreVec3, Selector } from "helix";
import type { FunctionRef, Objective } from "helix";
import { AXES, OBJECTIVE, POS_SCALE } from "./constants";

/**
 * **Target lead: knowing how fast a player is moving.**
 *
 * A shot solved against where the target *is* misses a moving one - a sprinting player
 * covers ~0.28 blocks/tick, so a 40-tick lob lands ~11 blocks behind them. There is no
 * `Motion` on a player to read (the server doesn't write it), so velocity is *derived*:
 * diff this tick's `Pos` against last tick's, per axis, per player.
 *
 * That costs a function per tracked player per tick, so the set is kept small:
 * **firing at someone enrols them**, and they drop out {@link TRACK_TTL} ticks after the
 * last shot. Emitted at most once per datapack however many shots ask for `lead`.
 */

/** Players currently being diffed. Enrolment is by shot, not by being online. */
const TRACK_TAG = "ballistics.tracked";

/**
 * Ticks a target stays enrolled after the last shot at it. Long enough to span any
 * sane reload cooldown, so a sustained engagement never falls back to a cold sample.
 */
const TRACK_TTL = 200;

export interface Tracker {
  /** Per-axis velocity in centi-blocks/tick, keyed by player. */
  readonly vel: Objective[];
  /** Run *as* a target to (re)enrol it. Idempotent; refreshes the TTL. */
  readonly enroll: FunctionRef;
}

/** One tracker per datapack, whatever asks for it. */
const trackers = new WeakMap<Datapack, Tracker>();

export function targetVelocity(dp: Datapack): Tracker {
  const existing = trackers.get(dp);
  if (existing) return existing;

  const vel = AXES.map((a) => dp.objective(`${OBJECTIVE}.v${a}`));
  const prev = AXES.map((a) => dp.objective(`${OBJECTIVE}.p${a}`));
  const ttl = dp.objective(`${OBJECTIVE}.ttl`);
  const me = () => Selector.self();
  /** The three objectives as one `@s`-bound vector. */
  const vec = (o: Objective[]) => ScoreVec3.from((_, i) => o[i].score(me()));

  // Cold start: seed `prev` from the current position and zero the velocity. Without
  // this, a player who dropped out of the set, walked 500 blocks and got re-enrolled
  // would diff against where they left off and the next shell would aim at the moon.
  const init = dp.createFunction("zzz/track_init");
  init.build((ctx) => {
    vec(prev).readEntity(me(), Path.Entity.Pos, POS_SCALE, { ctx });
    for (const axis of vec(vel).components) axis.set(0, ctx);
  });

  const enroll = dp.createFunction("zzz/track_enroll");
  enroll.build((ctx) => {
    ctx
      .execute()
      .unlessEntity(me().tag(TRACK_TAG))
      .run((c) => c.call(init));
    ctx.tag().add(me(), TRACK_TAG);
    ttl.score(me()).set(TRACK_TTL, ctx);
  });

  const track = dp.createFunction("zzz/track_targets");
  track.build((ctx) => {
    // v = now - then, *then* then = now. Order matters: the subtract has to see last
    // tick's value before it is overwritten.
    const v = vec(vel);
    const then = vec(prev);
    v.readEntity(me(), Path.Entity.Pos, POS_SCALE, { ctx }).sub(then, ctx);
    then.readEntity(me(), Path.Entity.Pos, POS_SCALE, { ctx });
    // Nobody has shot at them in a while - stop paying for them.
    const left = ttl.score(me());
    left.remove(1, ctx);
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
  trackers.set(dp, tracker);
  return tracker;
}
