import { Datapack, Range, ScoreTarget } from "helix";
import type { FunctionContext, FunctionRef, Id } from "helix";
import type { DatapackModule, ModuleMetadata, ModuleRef } from "./module.interface";
import type { ScoreTrigger } from "./area";
import type { Graph, Node } from "./graph";
import { ActiveFlags } from "./flags";
import { EventLatches, emitHandler, getEventHandlers, type EventHandler } from "./events";
import { triggerZones, whenPlayerInZones } from "./regions";

/** One thing a module contributes to a tick, already bound to its instance. */
type Emit = (ctx: FunctionContext) => void;

/** Everything the tick-tree walk needs threaded through it. */
export interface Wiring {
  graph: Graph;
  flags: ActiveFlags;
  latches: EventLatches;
  dp: Datapack;
  needsTick: (ref: ModuleRef) => boolean;
  activateOf: Map<ModuleRef, FunctionRef>;
  deactivateOf: Map<ModuleRef, FunctionRef>;
  /** Each area's effective dimension (own or inherited); `undefined` if none. */
  dims: Map<ModuleRef, Id | undefined>;
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
  // Everything this module contributes per tick, bucketed by how often it runs:
  // `onTick` at the module's own cadence, and each `@On` handler at its own
  // (defaulting to the module's). Buckets share one throttle gate, so declaring a
  // per-handler `every` costs a gate per distinct period, not per handler.
  const modulePeriod = node.meta.tickEvery ?? 1;
  const modulePhase = w.phaseOf(node);
  const buckets = new Map<string, { period: number; phase: number; bodies: Emit[] }>();
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
    bucket(period, handler.opts.phase ?? modulePhase % period, (c) =>
      emitHandlerOf(w, node, handler, c),
    );
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
  name: string,
  build: (ctx: FunctionContext) => void,
): FunctionRef {
  const fn = dp.createFunction(name);
  fn.build(build);
  return fn;
}

/** Emit one `@On` handler, resolving its latch and where its body lands. */
function emitHandlerOf(w: Wiring, node: Node, handler: EventHandler, ctx: FunctionContext): void {
  const { instance, meta } = node;
  // Imperative handlers (addEventHandler) carry their body directly; decorator
  // ones name a method on the instance.
  const body0 = handler.fn ?? resolveMethodBody(instance, meta, handler);
  const latch =
    handler.opts.once === false ? undefined : w.latches.score(meta.name, handler.method);
  // A named body commits to its own function once, up front, so the guard calls
  // it rather than re-emitting the body at each site.
  let named: FunctionRef | undefined;
  if (handler.opts.name) {
    named = instance.defineFunction
      ? instance.defineFunction(w.dp, handler.opts.name, body0)
      : defaultDefine(w.dp, handler.opts.name, body0);
  }
  const body = named ? (c: FunctionContext) => c.call(named) : body0;
  emitHandler(ctx, handler, latch, body);
}

/** The body of a decorator handler: its named method, bound to the instance. */
function resolveMethodBody(
  instance: DatapackModule,
  meta: ModuleMetadata,
  handler: EventHandler,
): (c: FunctionContext) => void {
  const method = (instance as unknown as Record<string, (c: FunctionContext) => void>)[
    handler.method
  ];
  if (typeof method !== "function") {
    throw new Error(`@On marked ${meta.name}.${handler.method}, which is not a method`);
  }
  return (c) => method.call(instance, c);
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
export function wireTick(w: Wiring, ref: ModuleRef, ctx: FunctionContext, dim?: Id): void {
  const node = w.graph.nodes.get(ref)!;
  emitTick(w, node, ctx);
  for (const childRef of node.children) {
    if (!w.needsTick(childRef)) continue; // nothing to run below → emit nothing
    const child = w.graph.nodes.get(childRef)!;
    if (!child.meta.area) {
      wireTick(w, childRef, ctx, dim); // inline, gated by (and in the dimension of) ancestors
      continue;
    }
    emitArea(w, childRef, ctx, dim);
  }
}

/**
 * Emit one area's per-tick shape: its arm detector (behind `active == 0`), then
 * its `active == 1` block holding its subtree and its presence disarm - all
 * wrapped in the area's dimension when that differs from the one already in
 * effect.
 *
 * Used for a child area within its parent's already-gated tick, and for a root
 * module that is itself an area, which the factory calls directly - the two are
 * the same shape, so an area at the top of the tree is gated exactly like one
 * anywhere else.
 */
export function emitArea(w: Wiring, ref: ModuleRef, ctx: FunctionContext, dim?: Id): void {
  const node = w.graph.nodes.get(ref)!;
  // An area with its own dimension (differing from the one already in effect)
  // runs its detectors and whole subtree wrapped in it; one that inherits its
  // parent's dimension is already inside that `execute in …`, so it needs no
  // wrap of its own - re-wrapping would just emit a redundant line. Positional
  // triggers and block reads below then resolve against the area's dimension,
  // not wherever the tick loop runs.
  const areaDim = w.dims.get(ref) ?? dim;
  const body = (host: FunctionContext) => {
    if (node.meta.trigger) emitArm(w, ref, host); // only fires while inactive
    host.if(w.flags.score(node.meta.name).equal(1), (inner) => {
      wireTick(w, ref, inner, areaDim);
      if (node.meta.trigger) emitPresence(w, ref, inner);
    });
  };
  if (areaDim && areaDim !== dim) ctx.execute().in(areaDim).run(body);
  else body(ctx);
}

/**
 * The activation detector for an area, gated behind `active == 0` so it stops
 * once the area is live.
 *
 * - `region` / `cuboid` / `zones` are **presence-based**: a player entering any
 *   zone (the union) calls `activate`. See {@link emitPresence} for the matching
 *   leave-the-region disarm.
 * - `score` triggers activate when the score matches. By default they **latch**,
 *   staying on until something calls `<name>/deactivate`; with `latch: false`
 *   {@link emitPresence} switches them back off when the score stops matching.
 */
function emitArm(w: Wiring, ref: ModuleRef, ctx: FunctionContext): void {
  const { meta } = w.graph.nodes.get(ref)!;
  const trigger = meta.trigger!;
  const activate = w.activateOf.get(ref)!;
  ctx.if(w.flags.score(meta.name).equal(0), (off) => {
    if (trigger.kind === "score") {
      off.if(scoreCondition(w, trigger), (hit) => hit.call(activate));
    } else if (trigger.kind === "players") {
      off.whenEntity(trigger.selector, (any) => any.call(activate));
    } else {
      whenPlayerInZones(off, triggerZones(trigger), (inside) => inside.call(activate));
    }
  });
}

/**
 * The "is this area's score satisfied?" condition, from either form of
 * {@link ScoreTrigger} - a single `equals` value or a `matches` band.
 */
function scoreCondition(w: Wiring, trigger: ScoreTrigger) {
  return scoreOf(w, trigger).matches(scoreRange(trigger));
}

/** The trigger's score cell. */
function scoreOf(w: Wiring, trigger: ScoreTrigger) {
  return w.dp.objective(trigger.objective).score(ScoreTarget(trigger.target));
}

/** Either form of {@link ScoreTrigger} as the one `matches` range it denotes. */
function scoreRange(trigger: ScoreTrigger): Range {
  if (trigger.matches) return new Range(trigger.matches.min, trigger.matches.max);
  if (trigger.equals === undefined) {
    throw new Error(
      `Score trigger on "${trigger.objective}" needs either \`equals\` or \`matches\``,
    );
  }
  return new Range(trigger.equals, trigger.equals);
}

/**
 * The leave-the-region disarm for a presence area, emitted inside its
 * `active == 1` block: recompute presence across the zone union each tick and
 * call `deactivate` once it empties.
 *
 * A `score` trigger latches by default and so has no disarm; `latch: false` opts
 * into the same both-ways tracking, deactivating once the score stops matching.
 * A `players` trigger is presence-shaped and so tracks both ways by default,
 * disarming once no player matches its selector.
 */
function emitPresence(w: Wiring, ref: ModuleRef, ctx: FunctionContext): void {
  const { meta } = w.graph.nodes.get(ref)!;
  const trigger = meta.trigger!;
  if (trigger.kind === "score") {
    if (trigger.latch !== false) return;
    const deactivate = w.deactivateOf.get(ref)!;
    ctx.execute()
      .unlessScoreMatches(scoreOf(w, trigger), scoreRange(trigger))
      .run((gone) => gone.call(deactivate));
    return;
  }
  if (trigger.kind === "players") {
    if (trigger.latch === true) return;
    // No flag needed: emptiness is one `unless entity` test on the same selector.
    const deactivate = w.deactivateOf.get(ref)!;
    ctx.whenEntity(trigger.selector, (gone) => gone.call(deactivate), "unless");
    return;
  }
  const present = w.flags.score(`${meta.name}.in`); // recomputed each tick while active
  const deactivate = w.deactivateOf.get(ref)!;
  present.set(0, ctx);
  whenPlayerInZones(ctx, triggerZones(trigger), (inside) => present.set(1, inside));
  ctx.if(present.equal(0), (gone) => gone.call(deactivate));
}
