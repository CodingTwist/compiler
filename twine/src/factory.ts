import "reflect-metadata";
import { Datapack, v1_20_4 } from "helix";
import type { FunctionContext, VersionProfile, FunctionRef, RuntimeTarget } from "helix";
import type { BuildEnv, ModuleClass, ModuleRef } from "./module.interface";
import { buildEnv, setBuildEnv } from "./env";
import { ActiveFlags } from "./flags";
import { EventLatches } from "./events";
import { buildGraph, needsTickMemo, resolveDimensions, type Node } from "./graph";
import { wireTick, type Wiring } from "./tick-wiring";

/**
 * Resolve each throttled module's fire phase. An explicit `tickPhase` is honoured;
 * otherwise modules sharing a `tickEvery` are spread round-robin (`0,1,2,…` mod
 * period) so they fire on different ticks instead of bunching on the same one.
 * Memoised per module so a module wired once keeps a stable phase.
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
  /**
   * Build target. Modules `env`-gated to other envs are pruned, and the value is
   * published for {@link isDev} so module bodies gate what they emit on the same
   * answer. Default: {@link buildEnv} (`TWINE_ENV`, else `"dev"`).
   */
  env?: BuildEnv;
  /**
   * Runtime this build targets (`"vanilla"` | `"paper"`). Drives `ctx.native(...)`
   * ops: `"paper"` emits the native plugin call, `"vanilla"` runs their fallback.
   * Default `"vanilla"`. Build the same root twice to ship both packs.
   */
  target?: RuntimeTarget;
}

/**
 * Bootstraps a {@link Datapack} from a root module - the NestJS-style
 * `NestFactory.create` analogue. Every module reachable through the root's
 * `imports` (and not pruned by `env`) is built once and wired into the pack.
 *
 * `area` modules gate their whole subtree: their `onTick` and every descendant's
 * `onTick` run only while the area's `active` flag is `1`, nested so an inactive
 * area costs a single check per tick. Areas also get `<name>/activate` and
 * `<name>/deactivate` functions that flip the flag and run their
 * `onActivate`/`onDeactivate` lifecycle.
 */
export class DatapackFactory {
  static create(root: ModuleClass, opts: FactoryOptions): Datapack {
    const dp = new Datapack(opts.name, opts.version ?? v1_20_4, opts.target);
    const flags = new ActiveFlags(dp);
    const latches = new EventLatches(dp);
    // Resolved once and published, so `isDev()` inside a module body can't
    // disagree with what the graph was pruned by - see ./env.ts.
    const env = opts.env ?? buildEnv();
    setBuildEnv(env);

    const graph = buildGraph(root, env);

    // register: arbitrary one-off setup, children-first.
    for (const ref of graph.order) graph.nodes.get(ref)!.instance.register?.(dp);

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

    // Each area's effective dimension, so its lifecycle and tick subtree run
    // where the area actually is rather than wherever they're called from.
    const dims = resolveDimensions(graph);

    // activate / deactivate functions per area (flag flip + lifecycle). The flag
    // is a scoreboard write, so it stays outside any dimension wrap; only the
    // user's lifecycle body - which may read blocks or summon at world
    // coordinates - is run in the area's dimension.
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
        flags.score(meta.name).set(1, ctx);
        if (instance.onActivate) inDimension(ref, ctx, (c) => instance.onActivate!(c));
      });
      activateOf.set(ref, activate);
      const deactivate = dp.createFunction(`${meta.name}/deactivate`);
      deactivate.build((ctx) => {
        if (instance.onDeactivate) inDimension(ref, ctx, (c) => instance.onDeactivate!(c));
        flags.score(meta.name).set(0, ctx);
      });
      deactivateOf.set(ref, deactivate);
    }

    // tick: a single tree-walk. An area's *whole* subtree - its own `onTick`, its
    // descendants' ticks, AND its activation/presence detectors - is nested
    // behind its `active` flag. So a dormant area, and every area beneath it,
    // costs nothing per tick beyond its parent's single `if score … active`
    // check: a child area's "are you near?" trigger isn't even evaluated until
    // its parent is live. Only top-level area detectors run unconditionally.
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
    };
    if (w.needsTick(graph.root)) {
      dp.tick((ctx) => wireTick(w, graph.root, ctx));
    }

    consolidateTick(dp);

    return dp;
  }
}

/**
 * Collapse `minecraft:tick` to the single framework-owned `<ns>:tick` entry.
 *
 * helix auto-tags every function created with the `tick` tag straight into
 * vanilla `minecraft:tick` - spool plugins (`grapple/tick`), `defineItem` item
 * ticks, the scoreboard clock, etc. That's the right un-opinionated default for a
 * plain-helix pack, but under the framework the per-tick surface should be one
 * thing you own: a single tag member whose body lists every per-tick function, so
 * the whole pack's tick cost is traceable in one place and gateable as a unit.
 *
 * So reparent: untag every *other* `tick` member from `minecraft:tick` and append
 * a `function` call to it onto the root `tick` body (after the module tree-walk).
 * Same work runs each tick, now dispatched from - and visible in - `<ns>:tick`.
 *
 * `DatapackFactory.create` runs this once over the module tree. It's also
 * **idempotent** and exported, so a consumer that adds more `tick`-tagged
 * functions imperatively *after* `create` (raw helix/spool calls) can re-run it
 * just before `writeDatapack` to sweep those too - already-reparented members are
 * no longer in the tag, so a re-run only collapses the new ones.
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
