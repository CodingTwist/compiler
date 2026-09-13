import { Datapack, Pos, privateName, Range, ScoreTarget, Selector, Trigger } from "helix";
import type { FunctionContext, FunctionRef, Id, Score } from "helix";
import type { DatapackModule, ModuleMetadata, ModuleRef } from "./module.interface";
import type { ScoreTrigger, Zone } from "./area";
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
  /** Each module's `<name>/tick`, built once however many parents call it. */
  ticks: Map<ModuleRef, { fn: FunctionRef; dim?: Id }>;
}

/** Emits a module's `onTick`, throttled by `tickEvery` if set. Nested inside area gating. */
function emitTick(w: Wiring, node: Node, ctx: FunctionContext): void {
  // Everything this module runs per tick, grouped by period. Each period shares one throttle check.
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
  // A named body is created once, and every guard calls it.
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
 * A module's tick subtree goes in its own `<name>/tick`, so each module's cost shows under its
 * name.
 */
function moduleTick(w: Wiring, ref: ModuleRef, dim: Id | undefined, body: Emit): FunctionRef {
  const name = `${w.graph.nodes.get(ref)!.meta.name}/tick`;
  // A module imported by several parents is built once and called from each.
  const built = w.ticks.get(ref);
  if (built) {
    if (built.dim !== dim) {
      throw new Error(`Module "${name}" is imported under two different dimensions - give it its own dimension`);
    }
    return built.fn;
  }
  if (w.dp.functionRef(name)) {
    throw new Error(`Module tick "${name}" collides with an existing function - rename the module or that function`);
  }
  const fn = w.dp.createFunction(name);
  w.ticks.set(ref, { fn, dim });
  fn.build(body);
  return fn;
}

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
      if (!child.instance.onTick && getEventHandlers(child.instance).length === 0) {
        wireTick(w, childRef, ctx, dim, gates);
        continue;
      }
      // gated by (and in the dimension of) ancestors
      ctx.call(moduleTick(w, childRef, dim, (c) => wireTick(w, childRef, c, dim, gates)));
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
    host.if(w.flags.score(node.meta.name).equal(1), (inner) => inner.call(tick));
  };
  if (areaDim && areaDim !== dim) ctx.execute().in(areaDim).run(body);
  else body(ctx);
}

/**
 * The area's activation check, only while `active == 0`.
 *
 * - Geometric triggers activate when a player enters any zone; see {@link emitPresence} for
 * leaving.
 * - `score` triggers activate when the score matches, and latch unless `latch: false`.
 */
function emitArm(
  w: Wiring,
  ref: ModuleRef,
  ctx: FunctionContext,
  dim: Id | undefined,
  gates: Score[],
): void {
  const { meta } = w.graph.nodes.get(ref)!;
  const trigger = meta.trigger!;
  const activate = w.activateOf.get(ref)!;
  if (trigger.kind !== "score" && trigger.kind !== "players") {
    armByAdvancement(w, ref, triggerZones(trigger), dim, gates);
    return;
  }
  ctx.if(w.flags.score(meta.name).equal(0), (off) => {
    if (trigger.kind === "score") {
      off.if(scoreOf(w, trigger).matches(scoreRange(trigger)), (hit) => hit.call(activate));
    } else if (trigger.kind === "players") {
      off.whenEntity(trigger.selector, (any) => any.call(activate));
    }
  });
}

/**
 * Arms a geometric area with `minecraft:location` advancements, so a dormant area costs nothing per
 * tick.
 *
 * Vanilla checks `location` about once a second, so entry can lag up to 1s, and it tests the
 * player's feet. Leaving can't be a trigger, so {@link emitPresence} still polls.
 */
function armByAdvancement(
  w: Wiring,
  ref: ModuleRef,
  zones: Zone[],
  dim: Id | undefined,
  gates: Score[],
): void {
  const { meta } = w.graph.nodes.get(ref)!;
  const activate = w.activateOf.get(ref)!;
  const self = w.flags.score(meta.name);
  zones.forEach((zone, i) => {
    const name = privateName(`${meta.name}/enter_${i}`);
    if (w.dp.functionRef(name)) return; // area reached from a second parent: already armed
    const [from, to] =
      zone.shape === "sphere"
        ? [zone.center.map((c) => c - zone.radius), zone.center.map((c) => c + zone.radius)]
        : [zone.from, zone.to];
    // Cuboid corners are inclusive blocks, so the box runs to the far block's far face.
    const far = zone.shape === "sphere" ? 0 : 1;
    const axis = (k: number) => ({ min: Math.min(from[k], to[k]), max: Math.max(from[k], to[k]) + far });
    const trigger = Trigger.location({
      ...(dim ? { dimension: dim } : {}),
      position: { x: axis(0), y: axis(1), z: axis(2) },
    });
    w.dp.event(name, trigger, (ctx) => {
      const chain = ctx.execute();
      for (const gate of gates) chain.ifScoreMatches(gate, Range.exactly(1));
      chain.ifScoreMatches(self, Range.exactly(0));
      if (zone.shape === "sphere") {
        chain.positioned(Pos(...zone.center)).ifEntity(Selector.self().distance(Range.atMost(zone.radius)));
      }
      chain.run((hit) => hit.call(activate));
    });
  });
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
  return Range.exactly(trigger.equals);
}

/**
 * The leave check for a presence area, inside its `active == 1` block: deactivate once nobody
 * matches.
 *
 * `score` triggers only get one with `latch: false`; `players` triggers get one by default.
 */
function emitPresence(w: Wiring, ref: ModuleRef, ctx: FunctionContext): void {
  const { meta } = w.graph.nodes.get(ref)!;
  const trigger = meta.trigger!;
  const deactivate = w.deactivateOf.get(ref)!;
  if (trigger.kind === "score") {
    if (trigger.latch !== false) return;
    ctx.execute()
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
  whenPlayerInZones(ctx, triggerZones(trigger), (inside) => present.set(1, inside));
  ctx.if(present.equal(0), (gone) => gone.call(deactivate));
}
