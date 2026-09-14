// Per-area `activate`/`deactivate` functions, and per-module `rearm` functions.
import type { Datapack, FunctionContext, FunctionRef, Id } from "helix";
import type { ModuleRef } from "../module.interface";
import type { ActiveFlags } from "../flags";
import { getEventHandlers, type EventLatches } from "../events";
import type { Graph } from "../graph";

/** What the lifecycle functions are built from. */
export interface LifecycleDeps {
  dp: Datapack;
  graph: Graph;
  flags: ActiveFlags;
  latches: EventLatches;
  dims: Map<ModuleRef, Id | undefined>;
  areas: ModuleRef[];
}

/** Builds every area's activate/deactivate and every latched module's rearm function. */
export function buildLifecycle({ dp, graph, flags, latches, dims, areas }: LifecycleDeps) {
  // activate / deactivate functions per area. Only the user's lifecycle body runs in the
  // area's dimension; the flag write doesn't need it.
  const activateOf = new Map<ModuleRef, FunctionRef>();
  const deactivateOf = new Map<ModuleRef, FunctionRef>();
  const inDimension = (ref: ModuleRef, ctx: FunctionContext, body: (c: FunctionContext) => void) => {
    const dim = dims.get(ref);
    if (dim) ctx.execute().in(dim).run(body);
    else body(ctx);
  };
  for (const ref of areas) {
    const { instance, meta } = graph.nodes.get(ref)!;
    const activate = dp.createFunction(`${meta.name}/activate`);
    activate.build((ctx) => {
      flags.score(meta.name).set(1);
      if (instance.onActivate) inDimension(ref, ctx, (c) => instance.onActivate!(c));
    });
    activateOf.set(ref, activate);
    const deactivate = dp.createFunction(`${meta.name}/deactivate`);
    deactivate.build((ctx) => {
      if (instance.onDeactivate) inDimension(ref, ctx, (c) => instance.onDeactivate!(c));
      flags.score(meta.name).set(0);
    });
    deactivateOf.set(ref, deactivate);
  }

  // `<name>/rearm` for modules with latched handlers, clearing their latches.
  //
  // Latches survive /reload, so a pack's reset needs something to call.
  for (const ref of graph.order) {
    const { instance, meta } = graph.nodes.get(ref)!;
    const latched = getEventHandlers(instance).filter((h) => h.opts.once !== false);
    if (latched.length === 0) continue;
    dp.createFunction(`${meta.name}/rearm`).build((ctx) => {
      for (const h of latched) latches.score(meta.name, h.method).set(0);
    });
  }

  return { activateOf, deactivateOf };
}
