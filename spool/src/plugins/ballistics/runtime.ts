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
 * Emit the in-game solver: `v_h = (target - launcher)/A(n)`, `v_y = (Δy - G(n))/Ay(n)`
 * as scoreboard
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
  // Isotropic drag (everything but a living entity) makes the two responses the same
  // number, so the emitted function keeps its single divisor and its single constant.
  const anisotropic = dragFixedY !== dragFixed;

  const objective = dp.objective(OBJECTIVE);
  const scoreFor = (holder: string): Score => objective.score(ScoreTarget(holder));
  /** The launch velocity being solved for, the launcher's position, the target's velocity. */
  const velocity = ScoreVec3.from((a) => scoreFor(`#v${a}`));
  const launcherPos = ScoreVec3.from((a) => scoreFor(`#p${a}`));
  const targetVel = ScoreVec3.from((a) => scoreFor(`#l${a}`));
  const scaleConst = scoreFor("#v_scale");
  const dragConst = scoreFor("#a");
  const dragConstY = scoreFor("#ay");
  const ticksConst = scoreFor("#ticks");

  // Velocity objectives read against the *target* - one row per tracked player.
  const tracker = opts.lead ? targetVelocity(dp) : undefined;
  const lead =
    tracker && ScoreVec3.from((_, i) => tracker.vel[i].score(ScoreTarget(to)));

  const fuse = shellFuse(opts, profile, ticks);
  const shotTag = `${dp.name}.shot`;
  // Rebuilt per use: Selector builders mutate in place, so one shared instance would
  // leak its filters into every clause it appears in.
  const shotSelector = () => Selector.allEntities().tag(shotTag).limit(1);

  const shellSpec = { motion: [0, 0, 0], fuse, tags: [shotTag] } as const;
  // `motion` is zeroed rather than omitted: `store … entity Motion[i]` below needs the
  // list to already exist.
  let spawnShell = (c: FunctionContext) =>
    summonShell(c, Pos.here(), { shell: opts.shell, ...shellSpec });

  // Lifted out of the solver so a pack can ship an editable one-line shell file, or decide
  // for itself what appears - see `shellFunction`. The fuse in it is this shot's flight
  // time, so a named file is this shot's alone.
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
    scaleConst.set(V_SCALE, ctx);
    dragConst.set(dragFixed, ctx);
    if (anisotropic) dragConstY.set(dragFixedY, ctx);
    if (tracker) {
      ticksConst.set(ticks, ctx);
      // The lead is `vel x kTicks`, so scaling the tick constant by the caller's score
      // is the whole runtime switch - 0 there means no lead, with no second arc baked.
      if (typeof opts.lead === "object") ticksConst.times(opts.lead, ctx);
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

    // The solve, one axis at a time:
    //
    //   v = (target + vel*ticks - launcher - G) * V_SCALE / A
    //
    // `* V_SCALE` before the divide because the divide is integer: dividing a
    // centi-block displacement by A directly would floor most of it away. `- G` is
    // vertical only, and free (`scoreboard players add|remove` takes the literal).
    const displacement = (axis: 0 | 1 | 2) =>
      lead
        ? math`${velocity.components[axis]} + ${targetVel.components[axis]} * ${ticksConst} - ${launcherPos.components[axis]}`
        : math`${velocity.components[axis]} - ${launcherPos.components[axis]}`;

    const verticalDisplacement =
      gravityFixed === 0
        ? displacement(1)
        : math`${displacement(1)} - ${gravityFixed}`;
    math`${displacement(0)} * ${scaleConst} / ${dragConst}`.into(velocity.x, ctx);
    math`${verticalDisplacement} * ${scaleConst} / ${anisotropic ? dragConstY : dragConst}`.into(
      velocity.y,
      ctx,
    );
    math`${displacement(2)} * ${scaleConst} / ${dragConst}`.into(velocity.z, ctx);

    // Vanilla *zeroes* a Motion axis past +/-10 rather than clamping it, which would drop
    // the shot on the thrower's head. Bail out instead; `0` tells the caller it held fire.
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
