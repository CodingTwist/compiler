// An area's leave check, run while it is active.
import type { FunctionContext } from "helix";
import type { ModuleRef } from "../module.interface";
import { triggerZones, whenPlayerInZones } from "../regions";
import type { Wiring } from "./types";
import { scoreOf, scoreRange } from "./score";

/**
 * The leave check for a presence area, inside its `active == 1` block: deactivate once nobody
 * matches.
 *
 * `score` triggers only get one with `latch: false`; `players` triggers get one by default.
 */
export function emitPresence(
  w: Wiring,
  ref: ModuleRef,
  ctx: FunctionContext,
): void {
  const { meta } = w.graph.nodes.get(ref)!;
  const trigger = meta.trigger!;
  const deactivate = w.deactivateOf.get(ref)!;
  if (trigger.kind === "score") {
    if (trigger.latch !== false) return;
    ctx
      .execute()
      .unlessScoreMatches(scoreOf(w, trigger), scoreRange(trigger))
      .run((gone) => gone.call(deactivate));
    return;
  }
  if (trigger.kind === "players") {
    if (trigger.latch === true) return;
    // No flag needed: emptiness is one `unless entity` test on the same selector.
    ctx.whenEntity(trigger.selector, (gone) => gone.call(deactivate), "unless");
    return;
  }
  const present = w.flags.score(`${meta.name}.in`); // recomputed each tick while active
  present.set(0);
  whenPlayerInZones(ctx, triggerZones(trigger), (inside) =>
    present.set(1, inside),
  );
  ctx.if(present.equal(0), (gone) => gone.call(deactivate));
}
