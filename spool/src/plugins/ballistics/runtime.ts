import {
  Datapack,
  Path,
  Pos,
  Range,
  ScoreTarget,
  ScoreVec3,
  Selector,
} from "helix";
import type { FunctionRef, Score } from "helix";
import { shellFuse, summonShell } from "./shell";
import { MOTION_AXIS_LIMIT, trajectoryBasis } from "./physics";
import { OBJECTIVE, POS_SCALE, V_SCALE } from "./constants";
import { resolveShotOptions, type RuntimeShotOptions } from "./options";
import { targetVelocity } from "./tracking";

export type { RuntimeShotOptions } from "./options";

/**
 * Emit the in-game solver: `v = (target - launcher - ĵ·G(n)) / A(n)` as scoreboard
 * arithmetic, then a `/summon` whose `Motion` is stored from it. See `options.ts` for
 * the shape of the shot and what it trades against the compile-time solver.
 */
export function defineRuntimeShot(
  dp: Datapack,
  name: string,
  opts: RuntimeShotOptions = {},
): FunctionRef {
  const { from, to, profile, ticks } = resolveShotOptions(opts);

  // The same basis the compile-time solver inverts - sampled at the one chosen tick.
  const { A, G } = trajectoryBasis(profile, ticks);
  const aFixed = Math.round(A[ticks] * POS_SCALE);
  const gFixed = Math.round(G[ticks] * POS_SCALE);
  if (aFixed <= 0)
    throw new Error(
      `ballistics: A(${ticks}) is not positive - no shot exists.`,
    );

  const obj = dp.objective(OBJECTIVE);
  const slot = (holder: string): Score => obj.score(ScoreTarget(holder));
  /** The launch velocity being solved for, and a scratch point to build it from. */
  const v = ScoreVec3.from((a) => slot(`#v${a}`));
  const p = ScoreVec3.from((a) => slot(`#p${a}`));
  const kScale = slot("#v_scale");
  const kA = slot("#a");
  const kTicks = slot("#ticks");

  // Velocity objectives read against the *target* - one row per tracked player.
  const tracker = opts.lead ? targetVelocity(dp) : undefined;
  const lead =
    tracker && ScoreVec3.from((_, i) => tracker.vel[i].score(ScoreTarget(to)));

  const fuse = shellFuse(opts, profile, ticks);
  const shotTag = `${dp.name}.shot`;
  // Rebuilt per use: Selector builders mutate in place, so one shared instance would
  // leak its filters into every clause it appears in.
  const shot = () => Selector.allEntities().tag(shotTag).limit(1);

  const fn = dp.createFunction(name);
  fn.build((ctx) => {
    kScale.set(V_SCALE, ctx);
    kA.set(aFixed, ctx);
    if (tracker) {
      kTicks.set(ticks, ctx);
      // Shooting at someone is what enrols them, so the tick loop only pays for players
      // actually under fire. `at from` first so `to` resolves from the thrower.
      // ponytail: the opening shell of an engagement is therefore unled - the sample is
      // one tick old at best. Call `enroll` from wherever you acquire the target if that
      // first shot needs to lead too.
      ctx
        .execute()
        .at(from)
        .as(to)
        .run((c) => c.call(tracker.enroll));
    }

    // `at from` so the *target* selector resolves from the thrower: `@p` means its
    // nearest player, and any `limit=1` sorts from it, not from wherever the caller
    // happened to be standing (a `tick`-tagged function runs at the world origin).
    v.readEntity(to, Path.Entity.Pos, POS_SCALE, { at: from, ctx });
    // Where they'll be in `ticks` ticks, at their current velocity.
    if (lead) {
      // `at from` again - the velocity is read off the same entity `to` just resolved to.
      lead.components.forEach((vel, axis) =>
        ctx
          .execute()
          .at(from)
          .run((c) => p.components[axis].assign(vel, c)),
      );
      p.scale(kTicks, ctx);
      v.add(p, ctx);
    }
    p.readEntity(from, Path.Entity.Pos, POS_SCALE, { ctx });
    v.sub(p, ctx);
    // Vertical only: take the gravity drop out before dividing (`v_y = (dy - G)/A`).
    // `scoreboard players add/remove` take a non-negative literal, so pick the verb.
    if (gFixed > 0) v.y.remove(gFixed, ctx);
    else if (gFixed < 0) v.y.add(-gFixed, ctx);
    // d(centi) * 10000 / A(centi) = v * 10000. Multiply first: the divide is integer,
    // and dividing a centi-block displacement by A directly would floor most of it away.
    v.scale(kScale, ctx).divide(kA, ctx);

    // Vanilla *zeroes* a Motion axis past +/-10 rather than clamping it, which would drop
    // the shot on the thrower's head. Bail out instead; `0` tells the caller it held fire.
    const limit = MOTION_AXIS_LIMIT * V_SCALE;
    for (const axis of v.components) {
      ctx
        .execute()
        .unlessScoreMatches(axis, new Range(-limit, limit))
        .run((c) => c.return_(0));
    }

    ctx
      .execute()
      .at(from)
      .run((at) =>
        // `motion` is zeroed here rather than omitted: `store … entity Motion[i]` below
        // needs the list to already exist.
        summonShell(at, Pos.here(), {
          shell: opts.shell,
          motion: [0, 0, 0],
          fuse,
          tags: [shotTag],
        }),
      );
    v.storeEntity(shot(), Path.Entity.Motion, "double", 1 / V_SCALE, { ctx });
    ctx.tag().remove(shot(), shotTag);
    ctx.return_(1);
  });
  return fn;
}
