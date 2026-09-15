import { Range, Selector } from "helix";
import type { FunctionContext } from "helix";
import { triggers } from "./gestures";
import type { MobParts } from "./parts";

/** `<mob>/tick_one`: everything one awake mob does per poll, as it, at it. */
export function tickOneBody<S extends string>(
  m: MobParts<S>,
  ctx: FunctionContext,
): void {
  // Yours first: it decides what the gestures' triggers and the yaw copy then see.
  if (m.def.tick) ctx.call(m.fnRef("on_tick"));
  // Then the state, if any: one check for a mob in none.
  if (m.def.states.size) {
    ctx
      .execute()
      .ifScoreMatches(m.stateObj.score(Selector.self()), Range.atLeast(1))
      .run((b) => b.call(m.fnRef("state")));
  }
  for (const g of m.def.gestures) {
    // The fall is emitted before the trigger, or a gesture started this tick would end immediately.
    if (!g.sequenced) {
      m.poseMembers(
        ctx,
        Selector.self().tag(m.gestureTag(g)),
        g,
        undefined,
        g.fall,
      );
      ctx.tag().remove(Selector.self().tag(m.gestureTag(g)), m.gestureTag(g));
    }
    if (g.cooldown !== 0) {
      ctx
        .execute()
        .ifScoreMatches(m.cooldown(g), Range.atLeast(1))
        .run((b) => b.call(m.fnRef(`${g.name}_clock`)));
    }
  }
  triggers(m, ctx);
  m.rig.face(ctx);
  if (m.def.relay) m.rig.relayHits(ctx, m.def.relay);
}
