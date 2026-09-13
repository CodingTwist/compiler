import "reflect-metadata";
import path from "path";
import { Datapack, ignoreSourceFrames, v1_20_4 } from "helix";
import type { DebugOptions, FunctionContext, Id, VersionProfile, FunctionRef, RuntimeTarget } from "helix";
import type { BuildEnv, ModuleClass, ModuleRef, ModuleScope } from "./module.interface";
import { buildEnv, setBuildEnv } from "./env";
import { setDifficulty, type DifficultyConfig } from "./difficulty";
import { ActiveFlags } from "./flags";
import { EventLatches, getEventHandlers } from "./events";
import { buildGraph, needsTickMemo, resolveDimensions, type Node } from "./graph";
import { emitArea, wireTick, type Wiring } from "./tick-wiring";

// Debug source tracking: lines twine emits itself point at twine, not the user's code.
// `../..` is the package root from `dist/core/`; update it if this file moves.
ignoreSourceFrames(path.resolve(__dirname, "../.."), { framework: true });

/**
 * The {@link ModuleScope} passed to `register`: its dimension and a `createFunction` that uses it.
 */
function scopeFor(dp: Datapack, name: string, dimension: Id | undefined): ModuleScope {
  return {
    name,
    dimension,
    fn(fnName, body) {
      const fn = dp.createFunction(fnName);
      fn.build((ctx) => {
        if (dimension) ctx.execute().in(dimension).run(body);
        else body(ctx);
      });
      return fn;
    },
  };
}

/**
 * Picks each throttled module's tick phase. Modules sharing a `tickEvery` are spread round-robin so
 * they don't all run on the same tick. An explicit `tickPhase` wins.
 */
function makePhaseAllocator(): (node: Node) => number {
  const nextPerPeriod = new Map<number, number>();
  const assigned = new Map<Node, number>();
  return (node: Node): number => {
    if (node.meta.tickPhase !== undefined) return node.meta.tickPhase;
    const cached = assigned.get(node);
    if (cached !== undefined) return cached;
    const period = node.meta.tickEvery ?? 1;
    const n = nextPerPeriod.get(period) ?? 0;
    const phase = n % period;
    nextPerPeriod.set(period, n + 1);
    assigned.set(node, phase);
    return phase;
  };
}

export interface FactoryOptions {
  /** Datapack name (also the output namespace). */
  name: string;
  /** Target version profile. Default {@link v1_20_4}. */
  version?: VersionProfile;
  /** Build environment. Modules for other envs are pruned. Default: {@link buildEnv}. */
  env?: BuildEnv;
  /**
   * Runtime target (`"vanilla"` | `"paper"`), for `ctx.native(...)`. Default `"vanilla"`.
   */
  target?: RuntimeTarget;
  /**
   * Debug-only build settings, off by default. `sources` maps commands to source lines;
   * `comments` also writes them into the pack.
   */
  debug?: DebugOptions;
  /** Mob scaling per difficulty level, usually imported from a `difficulty.config.ts`. */
  difficulty?: DifficultyConfig;
}

/**
 * Builds a {@link Datapack} from a root module, like NestJS's `NestFactory.create`.
 *
 * `area` modules gate their subtree: its ticks only run while the area's `active` flag is `1`, so a
 * dormant area costs one check per tick. Areas get `<name>/activate` and `<name>/deactivate`.
 */
export class DatapackFactory {
  static create(root: ModuleClass, opts: FactoryOptions): Datapack {
    const dp = new Datapack(opts.name, opts.version ?? v1_20_4, opts.target, {
      debug: opts.debug,
    });
    return DatapackFactory.mount(dp, root, opts);
  }

  /**
   * Wires the module tree into an existing `dp`, e.g. the one the `helix` CLI created.
   * {@link create} does this on a new Datapack.
   */
  static mount(dp: Datapack, root: ModuleClass, opts: { env?: BuildEnv; difficulty?: DifficultyConfig } = {}): Datapack {
    const flags = new ActiveFlags(dp);
    const latches = new EventLatches(dp);
    // Resolved once and published, so `isDev()` agrees with how the graph was pruned.
    const env = opts.env ?? buildEnv();
    setBuildEnv(env);
    setDifficulty(opts.difficulty ?? {});

    const graph = buildGraph(root, env);

    // Each module's dimension, so its lifecycle, ticks and functions run where the module is.
    const dims = resolveDimensions(graph);

    // register: arbitrary one-off setup, children-first.
    for (const ref of graph.order) {
      const { instance, meta } = graph.nodes.get(ref)!;
      instance.register?.(dp, scopeFor(dp, meta.name, dims.get(ref)));
    }

    // load: seed every area's flag, then run all (ungated) load bodies.
    const loaders = graph.order.filter((ref) => graph.nodes.get(ref)!.instance.onLoad);
    const areas = graph.order.filter((ref) => graph.nodes.get(ref)!.meta.area);
    if (loaders.length || areas.length) {
      dp.load((ctx) => {
        for (const ref of areas) {
          const { meta } = graph.nodes.get(ref)!;
          flags.setDefault(ctx, meta.name, meta.activeByDefault ?? false);
        }
        for (const ref of loaders) graph.nodes.get(ref)!.instance.onLoad!(ctx);
      });
    }

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

    // tick: one tree walk. An area's ticks, its children's ticks, and its children's triggers are
    // all behind its `active` flag, so a dormant area costs one check.
    const w: Wiring = {
      graph,
      flags,
      latches,
      dp,
      needsTick: needsTickMemo(graph),
      activateOf,
      deactivateOf,
      dims,
      phaseOf: makePhaseAllocator(),
      ticks: new Map(),
    };
    // A root that is an area gets the same gating as a child area, so it doesn't need a wrapper
    // module.
    if (w.needsTick(graph.root)) {
      const rootIsArea = graph.nodes.get(graph.root)!.meta.area;
      dp.tick((ctx) =>
        rootIsArea ? emitArea(w, graph.root, ctx) : wireTick(w, graph.root, ctx),
      );
    }

    consolidateTick(dp);

    return dp;
  }
}

/**
 * Moves every `minecraft:tick` function under the pack's own `<ns>:tick`.
 *
 * helix tags tick functions straight into `minecraft:tick`. Under twine the tick should be one list
 * you own, so the whole pack's tick cost is visible in one place.
 *
 * Safe to run again: call it before writing if you add tick functions after `create`.
 */
export function consolidateTick(dp: Datapack): void {
  const root = "tick";
  const members = [...(dp.tags.get("tick") ?? [])].filter((name) => name !== root);
  if (members.length === 0) return;
  for (const name of members) dp.untag(name, "tick");
  dp.tick((ctx) => {
    for (const name of members) ctx.call(dp.functionRef(name)!);
  });
}
