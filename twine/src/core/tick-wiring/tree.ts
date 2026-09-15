// Walks the module graph and emits each tick, gating child areas.
import type { FunctionContext, Id, Score } from "helix";
import type { ModuleRef } from "../module.interface";
import { getEventHandlers } from "../events";
import type { Wiring } from "./types";
import { emitTick, moduleTick } from "./module-tick";
import { emitArm } from "./arm";
import { emitPresence } from "./presence";

/**
 * Appends a module's tick body, then recurses into children.
 * Each child area adds a trigger check (while inactive) and a gated block (while active).
 */
export function wireTick(
  w: Wiring,
  ref: ModuleRef,
  ctx: FunctionContext,
  dim?: Id,
  gates: Score[] = [],
): void {
  const node = w.graph.nodes.get(ref)!;
  emitTick(w, node, ctx);
  for (const childRef of node.children) {
    if (!w.needsTick(childRef)) continue; // nothing to run below → emit nothing
    const child = w.graph.nodes.get(childRef)!;
    if (!child.meta.area) {
      // A module with only imports gets no `<name>/tick`; it would just forward.
      if (
        !child.instance.onTick &&
        getEventHandlers(child.instance).length === 0
      ) {
        wireTick(w, childRef, ctx, dim, gates);
        continue;
      }
      // gated by (and in the dimension of) ancestors
      ctx.call(
        moduleTick(w, childRef, dim, (c) =>
          wireTick(w, childRef, c, dim, gates),
        ),
      );
      continue;
    }
    emitArea(w, childRef, ctx, dim, gates);
  }
}

/**
 * Emits one area's tick: its trigger (while inactive), then its subtree and leave check (while
 * active).
 *
 * Used for child areas and for a root area, so both are gated the same way.
 */
export function emitArea(
  w: Wiring,
  ref: ModuleRef,
  ctx: FunctionContext,
  dim?: Id,
  gates: Score[] = [],
): void {
  const node = w.graph.nodes.get(ref)!;
  // Wrap in `execute in` only if the area's dimension differs from the one already in effect.
  const areaDim = w.dims.get(ref) ?? dim;
  const body = (host: FunctionContext) => {
    if (node.meta.trigger) emitArm(w, ref, host, areaDim, gates); // only fires while inactive
    const inside = [...gates, w.flags.score(node.meta.name)];
    const tick = moduleTick(w, ref, areaDim, (inner) => {
      wireTick(w, ref, inner, areaDim, inside);
      if (node.meta.trigger) emitPresence(w, ref, inner);
    });
    host.if(w.flags.score(node.meta.name).equal(1), (inner) =>
      inner.call(tick),
    );
  };
  if (areaDim && areaDim !== dim) ctx.execute().in(areaDim).run(body);
  else body(ctx);
}
