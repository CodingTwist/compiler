import { Datapack, ScoreTarget } from "helix";
import type { FunctionContext, FunctionRef } from "helix";
import type { ModuleRef } from "./module.interface";
import type { Graph, Node } from "./graph";
import { ActiveFlags } from "./flags";
import { triggerZones, whenPlayerInZones } from "./regions";

/** Everything the tick-tree walk needs threaded through it. */
export interface Wiring {
  graph: Graph;
  flags: ActiveFlags;
  dp: Datapack;
  needsTick: (ref: ModuleRef) => boolean;
  activateOf: Map<ModuleRef, FunctionRef>;
  deactivateOf: Map<ModuleRef, FunctionRef>;
  /** Resolve a throttled module's fire phase within its `tickEvery` period. */
  phaseOf: (node: Node) => number;
}

/**
 * Emit a module's `onTick`, throttled to every `tickEvery` ticks (offset by its
 * phase) when set. The throttle gate is nested in the *current* context, which is
 * already inside any ancestor area's `active` check, so throttling composes with
 * area gating rather than escaping it.
 */
function emitTick(w: Wiring, node: Node, ctx: FunctionContext): void {
  const onTick = node.instance.onTick;
  if (!onTick) return;
  const period = node.meta.tickEvery;
  if (period && period > 1) {
    const gate = w.dp.timing.phaseGate(w.dp, period, w.phaseOf(node));
    ctx.if(gate, (inner) => onTick.call(node.instance, inner));
  } else {
    onTick.call(node.instance, ctx);
  }
}

/**
 * Append a module's tick body, then recurse. Each area child contributes, *at its
 * parent's already-gated level*:
 *   - an arm detector behind `active == 0` (skip once live), and
 *   - an `active == 1` block holding the area's presence/deactivate check and its
 *     whole subtree.
 * Because this is emitted within the parent's `active` scope, none of it runs
 * while the parent is dormant.
 */
export function wireTick(w: Wiring, ref: ModuleRef, ctx: FunctionContext): void {
  const node = w.graph.nodes.get(ref)!;
  emitTick(w, node, ctx);
  for (const childRef of node.children) {
    if (!w.needsTick(childRef)) continue; // nothing to run below → emit nothing
    const child = w.graph.nodes.get(childRef)!;
    if (!child.meta.area) {
      wireTick(w, childRef, ctx); // inline, gated by ancestors
      continue;
    }
    if (child.meta.trigger) emitArm(w, childRef, ctx); // only fires while inactive
    ctx.if(w.flags.score(child.meta.name).equal(1), (inner) => {
      wireTick(w, childRef, inner);
      if (child.meta.trigger) emitPresence(w, childRef, inner);
    });
  }
}

/**
 * The activation detector for an area, gated behind `active == 0` so it stops
 * once the area is live.
 *
 * - `region` / `cuboid` / `zones` are **presence-based**: a player entering any
 *   zone (the union) calls `activate`. See {@link emitPresence} for the matching
 *   leave-the-region disarm.
 * - `score` triggers **latch**: they activate when the score matches and stay on
 *   until something calls `<name>/deactivate` (drive that from your own state).
 */
function emitArm(w: Wiring, ref: ModuleRef, ctx: FunctionContext): void {
  const { meta } = w.graph.nodes.get(ref)!;
  const trigger = meta.trigger!;
  const activate = w.activateOf.get(ref)!;
  ctx.if(w.flags.score(meta.name).equal(0), (off) => {
    if (trigger.kind === "score") {
      const score = w.dp.objective(trigger.objective).score(ScoreTarget(trigger.target));
      off.if(score.equal(trigger.equals), (hit) => hit.call(activate));
    } else {
      whenPlayerInZones(off, triggerZones(trigger), (inside) => inside.call(activate));
    }
  });
}

/**
 * The leave-the-region disarm for a presence area, emitted inside its
 * `active == 1` block: recompute presence across the zone union each tick and
 * call `deactivate` once it empties. `score` triggers latch, so they have no
 * presence side.
 */
function emitPresence(w: Wiring, ref: ModuleRef, ctx: FunctionContext): void {
  const { meta } = w.graph.nodes.get(ref)!;
  const trigger = meta.trigger!;
  if (trigger.kind === "score") return;
  const present = w.flags.score(`${meta.name}.in`); // recomputed each tick while active
  const deactivate = w.deactivateOf.get(ref)!;
  present.set(0, ctx);
  whenPlayerInZones(ctx, triggerZones(trigger), (inside) => present.set(1, inside));
  ctx.if(present.equal(0), (gone) => gone.call(deactivate));
}
