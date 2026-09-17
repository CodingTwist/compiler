/**
 * The `limb` plugin: legs of block displays that plant their feet on the ground and bend by FABRIK.
 *
 *   const legs = limb(dp.group("spider"), { name: "spider", legs, bones: [1, 1.2], block: Block.BLACK_CONCRETE });
 *   // each poll, as and at the mob, before the rig faces it:
 *   legs.tick(ctx);
 *
 * Feet stay put in the world and step, a gait group at a time, when the body walks away from
 * them. Bones ride the mob's rig root, so the rig's orphan sweep removes them, but keep yaw 0 and
 * are solved on world axes: easing a turn and a frame separately would swing the feet. Needs 26.3.
 */
import { Selector } from "helix";
import type { Datapack } from "helix";
import { framesInit, poseBones, storeFrames, summonBones } from "./bone";
import { solve } from "./solve";
import { createState } from "./state";
import { buildProbe, countSteps, plant, readBody, step } from "./step";
import type { Limb, LimbOptions } from "./types";

export { aimRotation } from "./bone";
export type { Leg, Limb, LimbOptions, Local } from "./types";

/** Legs for `opts`, emitted into `dp`. */
export function limb(dp: Datapack, opts: LimbOptions): Limb {
  const s = createState(dp, opts);
  dp.createFunction("init", "load").build((ctx) => {
    for (const o of s.objectives) o.init();
    ctx.storage(s.frames).mergeAll(framesInit(s));
  });

  const probes = opts.legs.map((_, i) => {
    const ref = dp.createFunction(`probe_${i}`);
    ref.build((ctx) => buildProbe(s, ctx, i));
    dp.allow("nbt-read", ref, "locator read, once per step");
    dp.allow("nbt-write", ref, "locator move, once per step");
    return ref;
  });
  const update = dp.createFunction("update");
  update.build((ctx) => {
    s.locator.ensure(ctx);
    readBody(s, ctx);
    ctx.execute().unlessEntity(Selector.self().tag(s.planted)).run((c) => {
      plant(s, c);
      c.tag().add(Selector.self(), s.planted);
    });
    countSteps(s, ctx);
    opts.legs.forEach((_, i) => {
      step(s, ctx, i, probes[i]);
      solve(s, ctx, i);
      storeFrames(s, ctx, i);
    });
  });
  dp.allow("nbt-read", update, "the body's Pos and yaw, once per poll for all legs");

  const summon = dp.createFunction("summon_bones");
  summon.build((ctx) => summonBones(s, ctx));
  dp.allow("missing-type", summon, "the rig root's display kind comes from its model; once per body");
  const pose = dp.createFunction("pose");
  pose.build((ctx) => {
    ctx.execute().unlessEntity(Selector.self().tag(s.boned)).run((b) => b.call(summon));
    poseBones(s, ctx);
  });

  return {
    update,
    pose,
    tick(ctx) {
      ctx.call(update);
      ctx.call(pose);
    },
  };
}
