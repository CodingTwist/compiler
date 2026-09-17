// `DatapackFactory`: builds a datapack from a root module.
import "reflect-metadata";
import path from "path";
import { Datapack, ignoreSourceFrames, v1_20_4 } from "helix";
import { difficulty } from "spool/plugins/difficulty";
import type { BuildEnv, ModuleClass } from "../module.interface";
import { buildEnv, setBuildEnv } from "../env";
import { ActiveFlags } from "../flags";
import { EventLatches } from "../events";
import { buildGraph, needsTickMemo, resolveDimensions } from "../graph";
import { emitArea, wireTick, type Wiring } from "../tick-wiring";
import { consolidateTick } from "./consolidate";
import { buildLifecycle } from "./lifecycle";
import type { FactoryOptions } from "./options";
import { makePhaseAllocator } from "./phase";
import { scopeFor } from "./scope";

// Debug source tracking: lines twine emits itself point at twine, not the user's code.
// `../../..` is the package root from `dist/core/factory/`; update it if this file moves.
ignoreSourceFrames(path.resolve(__dirname, "../../.."), { framework: true });

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
  static mount(
    dp: Datapack,
    root: ModuleClass,
    opts: { env?: BuildEnv; only?: string[] } = {},
  ): Datapack {
    const flags = new ActiveFlags(dp);
    const latches = new EventLatches(dp);
    // Resolved once and published, so `isDev()` agrees with how the graph was pruned.
    const env = opts.env ?? buildEnv();
    setBuildEnv(env);

    const graph = buildGraph(root, env, opts.only);
    if (!graph.nodes.size) return dp; // `only` selected no modules

    // ponytail: every twine pack gets this, used or not; gate on use if that ever matters.
    difficulty(dp);

    // Each module's dimension, so its lifecycle, ticks and functions run where the module is.
    const dims = resolveDimensions(graph);

    // register: arbitrary one-off setup, children-first.
    for (const ref of graph.order) {
      const { instance, meta } = graph.nodes.get(ref)!;
      const group = dp.root.group(meta.name);
      instance.register?.(group, scopeFor(group, meta.name, dims.get(ref)));
    }

    // load: seed every area's flag, then run all (ungated) load bodies.
    const loaders = graph.order.filter(
      (ref) => graph.nodes.get(ref)!.instance.onLoad,
    );
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

    const { activateOf, deactivateOf } = buildLifecycle({
      dp,
      graph,
      flags,
      latches,
      dims,
      areas,
    });

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
        rootIsArea
          ? emitArea(w, graph.root, ctx)
          : wireTick(w, graph.root, ctx),
      );
    }

    consolidateTick(dp);

    return dp;
  }
}
