// One module's `<name>/tick`: its onTick and event handlers, throttled by period.
import { Datapack } from "helix";
import type { FunctionContext, FunctionRef, Id } from "helix";
import type {
  DatapackModule,
  ModuleMetadata,
  ModuleRef,
} from "../module.interface";
import type { Node } from "../graph";
import { emitHandler, getEventHandlers, type EventHandler } from "../events";
import type { Emit, Wiring } from "./types";

/** Emits a module's `onTick`, throttled by `tickEvery` if set. Nested inside area gating. */
export function emitTick(w: Wiring, node: Node, ctx: FunctionContext): void {
  // Everything this module runs per tick, grouped by period. Each period shares one throttle check.
  const modulePeriod = node.meta.tickEvery ?? 1;
  const modulePhase = w.phaseOf(node, modulePeriod, node.meta.tickPhase);
  const buckets = new Map<
    string,
    { period: number; phase: number; bodies: Emit[] }
  >();
  const bucket = (period: number, phase: number, body: Emit): void => {
    const key = `${period}:${phase}`;
    const found = buckets.get(key) ?? { period, phase, bodies: [] };
    found.bodies.push(body);
    buckets.set(key, found);
  };

  const onTick = node.instance.onTick;
  if (onTick) {
    bucket(modulePeriod, modulePhase, (c) => onTick.call(node.instance, c));
  }
  for (const handler of getEventHandlers(node.instance)) {
    const period = handler.opts.every ?? modulePeriod;
    const phase =
      period === modulePeriod && handler.opts.phase === undefined
        ? modulePhase
        : w.phaseOf(node, period, handler.opts.phase);
    bucket(period, phase, (c) => emitHandlerOf(w, node, handler, c));
  }

  for (const { period, phase, bodies } of buckets.values()) {
    if (period > 1) {
      const gate = w.dp.timing.phaseGate(w.dp, period, phase);
      ctx.if(gate, (inner) => bodies.forEach((b) => b(inner)));
    } else {
      bodies.forEach((b) => b(ctx));
    }
  }
}

/** `dp.createFunction` + build, when a module has no `defineFunction` of its own. */
function defaultDefine(
  dp: Datapack,
  build: (ctx: FunctionContext) => void,
): FunctionRef {
  const fn = dp.createFunction();
  fn.build(build);
  return fn;
}

/** Emit one `@On` handler, resolving its latch and where its body lands. */
function emitHandlerOf(
  w: Wiring,
  node: Node,
  handler: EventHandler,
  ctx: FunctionContext,
): void {
  const { instance, meta } = node;
  // Imperative handlers (addEventHandler) carry their body directly; decorator
  // ones name a method on the instance.
  const body0 = handler.fn ?? resolveMethodBody(instance, meta, handler);
  const latch =
    handler.opts.once === false
      ? undefined
      : w.latches.score(meta.name, handler.method!);
  // An own body is created once, and every guard calls it.
  let own: FunctionRef | undefined;
  if (handler.opts.own) {
    own = w.dp.group(handler.group ?? meta.name, () =>
      instance.defineFunction
        ? instance.defineFunction(w.dp, body0)
        : defaultDefine(w.dp, body0),
    );
  }
  const body = own ? (c: FunctionContext) => c.call(own) : body0;
  emitHandler(ctx, handler, latch, body);
}

/** The body of a decorator handler: its named method, bound to the instance. */
function resolveMethodBody(
  instance: DatapackModule,
  meta: ModuleMetadata,
  handler: EventHandler,
): (c: FunctionContext) => void {
  const method = (
    instance as unknown as Record<string, (c: FunctionContext) => void>
  )[handler.method!];
  if (typeof method !== "function") {
    throw new Error(
      `@On marked ${meta.name}.${handler.method}, which is not a method`,
    );
  }
  return (c) => method.call(instance, c);
}

/**
 * A module's tick subtree goes in its own `<name>/tick`, so each module's cost shows under its
 * name.
 */
export function moduleTick(
  w: Wiring,
  ref: ModuleRef,
  dim: Id | undefined,
  body: Emit,
): FunctionRef {
  const name = `${w.graph.nodes.get(ref)!.meta.name}/tick`;
  // A module imported by several parents is built once and called from each.
  const built = w.ticks.get(ref);
  if (built) {
    if (built.dim !== dim) {
      throw new Error(
        `Module "${name}" is imported under two different dimensions - give it its own dimension`,
      );
    }
    return built.fn;
  }
  if (w.dp.functionRef(name)) {
    throw new Error(
      `Module tick "${name}" collides with an existing function - rename the module or that function`,
    );
  }
  const fn = w.dp.createFunction(name);
  w.ticks.set(ref, { fn, dim });
  fn.build(body);
  return fn;
}
