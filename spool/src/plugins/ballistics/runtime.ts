import {
  Datapack,
  Path,
  Pos,
  Range,
  ScoreTarget,
  ScoreVec3,
  Selector,
  math,
} from "helix";
import type { FunctionContext, FunctionRef, Score } from "helix";
import { shellFuse, summonShell } from "./shell";
import { MOTION_AXIS_LIMIT, trajectoryBasis } from "./physics";
import { OBJECTIVE, POS_SCALE, V_SCALE } from "./constants";
import { resolveShotOptions, type RuntimeShotOptions } from "./options";
import { targetVelocity } from "./tracking";

export type { RuntimeShotOptions } from "./options";

/**
 * Emits the in-game solver as scoreboard maths, then a `/summon` with that `Motion`.
 * See `options.ts`.
 */
export function defineRuntimeShot(
  dp: Datapack,
  name: string,
  opts: RuntimeShotOptions = {},
): FunctionRef {
  const { from, to, profile, ticks } = resolveShotOptions(opts);

  // The same basis the compile-time solver inverts - sampled at the one chosen tick.
  const { A: dragBasis, Ay: dragBasisY, G: gravityBasis } = trajectoryBasis(
    profile,
    ticks,
  );
  const dragFixed = Math.round(dragBasis[ticks] * POS_SCALE);
  const dragFixedY = Math.round(dragBasisY[ticks] * POS_SCALE);
  const gravityFixed = Math.round(gravityBasis[ticks] * POS_SCALE);
  if (dragFixed <= 0 || dragFixedY <= 0)
    throw new Error(
      `ballistics: A(${ticks}) is not positive - no shot exists.`,
    );

  const objective = dp.objective(OBJECTIVE);
  const scoreFor = (holder: string): Score => objective.score(ScoreTarget(holder));
  /** The launch velocity being solved for, the launcher's position, the target's velocity. */
  const velocity = ScoreVec3.from((a) => scoreFor(`#v${a}`));
  const launcherPos = ScoreVec3.from((a) => scoreFor(`#p${a}`));
  const targetVel = ScoreVec3.from((a) => scoreFor(`#l${a}`));

  // Velocity objectives read against the *target* - one row per tracked player.
  const tracker = opts.lead ? targetVelocity(dp) : undefined;
  const lead =
    tracker && ScoreVec3.from((_, i) => tracker.vel[i].score(ScoreTarget(to)));

  const fuse = shellFuse(opts, profile, ticks);
  const shotTag = `${dp.name}.shot`;
  // A function because selectors change in place.
  const shotSelector = () => Selector.allEntities().tag(shotTag).limit(1);

  const shellSpec = { motion: [0, 0, 0], fuse, tags: [shotTag] } as const;
  // `motion` is zeroed rather than omitted: `store … entity Motion[i]` below needs the
  // list to already exist.
  let spawnShell = (c: FunctionContext) =>
    summonShell(c, Pos.here(), { shell: opts.shell, ...shellSpec });

  // Custom shell, see `shellFunction`.
  if (typeof opts.shellFunction === "function") {
    const build = opts.shellFunction;
    spawnShell = (c) => build(c, shellSpec);
  } else if (opts.shellFunction) {
    if (dp.functionRef(opts.shellFunction))
      throw new Error(
        `ballistics: shellFunction "${opts.shellFunction}" already exists - ` +
          `each shot needs its own (the fuse baked into it is that shot's flight time).`,
      );
    const shellFn = dp.createFunction(opts.shellFunction);
    shellFn.build(spawnShell);
    spawnShell = (c) => c.call(shellFn);
  }

  const shotFn = dp.createFunction(name);
  shotFn.build((ctx) => {
    if (tracker) {
      // Shooting at someone enrols them in tracking, so only targeted players cost
      // anything.
      // ponytail: the first shot of an engagement doesn't lead. Call `enroll` earlier if it
      // must.
      ctx
        .execute()
        .at(from)
        .as(to)
        .run((c) => c.call(tracker.enroll));
    }

    // `at from` so `to` resolves from the thrower, not wherever the function runs.
    velocity.readEntity(to, Path.Entity.Pos, POS_SCALE, { at: from, ctx });
    // Their current velocity, for the `+ vel * ticks` lead term below.
    if (lead)
      // `at from` again - the velocity is read off the same entity `to` just resolved to.
      lead.components.forEach((vel, axis) =>
        ctx
          .execute()
          .at(from)
          .run((c) => targetVel.components[axis].assign(vel, c)),
      );
    launcherPos.readEntity(from, Path.Entity.Pos, POS_SCALE, { ctx });

    // Per axis: v = (target + vel*ticks - launcher - G) * V_SCALE / A
    //
    // Multiply before dividing, since integer division would floor most of it away.
    const leadTicks =
      typeof opts.lead === "object" ? math`${ticks} * ${opts.lead}` : ticks;
    const displacement = (axis: 0 | 1 | 2) =>
      lead
        ? math`${velocity.components[axis]} + ${targetVel.components[axis]} * ${leadTicks} - ${launcherPos.components[axis]}`
        : math`${velocity.components[axis]} - ${launcherPos.components[axis]}`;

    const drop = gravityFixed
      ? math`${displacement(1)} - ${gravityFixed}`
      : displacement(1);
    math`${displacement(0)} * ${V_SCALE} / ${dragFixed}`.into(velocity.x, ctx);
    math`${drop} * ${V_SCALE} / ${dragFixedY}`.into(velocity.y, ctx);
    math`${displacement(2)} * ${V_SCALE} / ${dragFixed}`.into(velocity.z, ctx);

    // Vanilla zeroes a Motion axis past ±10, which would drop the shot on the thrower.
    // Return 0 instead.
    const limit = MOTION_AXIS_LIMIT * V_SCALE;
    for (const axis of velocity.components) {
      ctx
        .execute()
        .unlessScoreMatches(axis, new Range(-limit, limit))
        .run((c) => c.return_(0));
    }

    ctx.execute().at(from).run(spawnShell);
    velocity.storeEntity(shotSelector(), Path.Entity.Motion, "double", 1 / V_SCALE, {
      ctx,
    });
    ctx.tag().remove(shotSelector(), shotTag);
    ctx.return_(1);
  });
  return shotFn;
}
