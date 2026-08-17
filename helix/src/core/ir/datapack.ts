// The top third of `Datapack`: the entry points authors actually call to run
// code (`load` / `tick` / `after` / periodic hooks) and the codegen/output
// surface. The class is split across three files purely for size - see
// datapack-core.ts (identity, functions, objectives) and datapack-resources.ts
// (every resource registry), both of which this extends and re-exports.
import { buildDatapack } from "../codegen/codegen";
import {
  analyzeCost,
  CostReport,
  formatCostReport,
} from "../report/cost-report";
import { FunctionNode } from "./node";
import { scoreInitNode } from "../commands/scoreboard";
import { FunctionRef } from "../function_ref";
import type { FunctionContext } from "../frontend/context";
import { TICKS_PER_SECOND } from "../timing/scoreboard-timing";
import { privateName } from "../private-fn";
import { Time } from "../values/time";
import { DatapackResources } from "./datapack-resources";

export type { FunctionTag } from "./datapack-core";
export {
  splitDefName,
  serializeItemDef,
  type RegistryTag,
  type ItemDefinition,
} from "./datapack-resources";

export class Datapack extends DatapackResources {
  /**
   * Write this pack to `outputPath` (functions, tags, data resources, structures,
   * `pack.mcmeta`). The disk-writing code lives in `codegen/write.ts` and is
   * loaded lazily via dynamic `import()`, so merely importing helix (or building a
   * pack in-memory with {@link buildDatapack}) never pulls in Node's `fs`/`path` -
   * that's what lets the compiler run in a browser. Consequently this is async;
   * `await` it if you need the files on disk before continuing.
   */
  async writeDatapack(outputPath: string, opts?: { zip?: boolean }) {
    this.prepareForCodegen();
    const { writeDatapack } = await import("../codegen/write.js");
    writeDatapack(this, outputPath, opts); //call back codegen
  }

  /**
   * Write this pack's resource pack (`assets/` + a resource-format `pack.mcmeta`)
   * to `outputPath` - a *separate* pack from {@link writeDatapack} (own folder,
   * own format). Emits generated models + item definitions + `resourceFile` JSON
   * and copies `addAssets` dirs verbatim. Async for the same reason as
   * {@link writeDatapack}: the disk path is dynamic-imported so the compiler
   * stays browser-safe.
   */
  async writeResourcePack(outputPath: string) {
    this.prepareForCodegen();
    const { writeResourcePack } = await import("../codegen/write.js");
    writeResourcePack(this, outputPath);
  }

  /**
   * Settle deferred authoring and inject load initializers, the shared prelude
   * to any codegen. Idempotent - `runFinalizers` and the init injection both
   * no-op on repeat - so {@link report} and {@link writeDatapack} can both call it.
   */
  private prepareForCodegen() {
    this.runFinalizers();
    this.ensureLoadInitializers();
  }

  /**
   * Static per-tick cost analysis: walks the call graph rooted at the `tick` tag
   * to report worst-case commands/tick and flag functions doing unbounded `@e`
   * scans. Runs codegen first (into `dp.files`), so call it once authoring is
   * done. Pure analysis - emits nothing and does not write to disk. Pass through
   * {@link formatCostReport} (or {@link printReport}) for a readable summary.
   */
  report(): CostReport {
    this.prepareForCodegen();
    buildDatapack(this); // populate dp.files; idempotent (cached per function)
    return analyzeCost(this);
  }

  /** Convenience: run {@link report} and print the formatted summary. */
  printReport(): CostReport {
    const report = this.report();
    console.log(formatCostReport(report));
    return report;
  }

  /**
   * A hook function that runs every `seconds` seconds (scoreboard clock).
   * `phase` (in ticks) staggers it within the period - see {@link everyTicks}.
   */
  everySeconds(seconds: number, phase = 0): FunctionRef {
    return this.timing.everyTicks(
      this,
      Math.round(seconds * TICKS_PER_SECOND),
      `${seconds}s`,
      phase,
    );
  }

  /**
   * A hook function that runs every `ticks` ticks (scoreboard clock). `phase`
   * offsets it within the period so several same-period hooks fire on different
   * ticks, spreading per-tick load instead of bunching it.
   */
  everyTicks(ticks: number, phase = 0): FunctionRef {
    return this.timing.everyTicks(this, ticks, `${ticks}t`, phase);
  }

  // `dp.clip()` / `dp.slide()` / `dp.effect()` are installed by the `spool`
  // package (it augments this prototype) - the animation mechanics are composed
  // conveniences over the public API, not part of the IR core. `import "spool"`
  // to use them. They share the `timing` strategy below.

  /** Append to the `load` function (runs on pack load / `/reload`). */
  load(builder: (ctx: FunctionContext) => void): FunctionRef {
    const ref = this.getOrCreateFunction("load", "load");
    ref.build(builder);
    return ref;
  }

  /**
   * Run `build` once, after `time` has elapsed:
   *
   *   dp.after(ctx, Time.seconds(3), (c) => c.say("done"));
   *
   * `schedule` needs a *named* target, which has meant inventing an entry-point
   * name for a body nothing ever calls directly. This captures it into an
   * auto-named private child of the calling function - the same scheme `if` and
   * `execute … run` bodies already use - and schedules that. Pass `append` to
   * queue behind a pending schedule for the same body instead of replacing it.
   *
   * Not a coroutine: the commands after this call still run *now*, and the body
   * runs at the world origin as the server, so it must re-establish any
   * `as`/`at` context it needs.
   */
  after(
    ctx: FunctionContext,
    time: Time,
    build: (ctx: FunctionContext) => void,
    append = false,
  ): FunctionRef {
    const ref = this.getOrCreateFunction(ctx.createChildFunction("after").name);
    ref.build(build);
    const id = this.idOf(ref);
    const schedule = ctx.schedule();
    if (append) schedule.functionAppend(id, time);
    else schedule.function_(id, time);
    return ref;
  }

  /** Append to the `tick` function (runs every game tick). */
  tick(builder: (ctx: FunctionContext) => void): FunctionRef {
    const ref = this.getOrCreateFunction("tick", "tick");
    ref.build(builder);
    return ref;
  }

  private ensureLoadInitializers() {
    // Ensure load function exists
    let loadFn = this.functions.get("load");

    if (!loadFn) {
      loadFn = new FunctionNode("load");
      this.functions.set("load", loadFn);

      // tag it properly
      if (!this.tags.has("load")) {
        this.tags.set("load", new Set());
      }
      this.tags.get("load")!.add("load");
    }

    // Ensure objective init function exists
    const initName = privateName("init_objectives");

    let initFn = this.functions.get(initName);
    if (!initFn) {
      initFn = new FunctionNode(initName);
      this.functions.set(initName, initFn);
    }

    // Rebuild the objective-creation body from the *current* objective set on
    // every call. prepareForCodegen is idempotent, but objectives may have been
    // registered between calls (e.g. `dp.report()`, then more authoring, then
    // `writeDatapack()`); freezing the body at first codegen would silently drop
    // those late objectives from init. Clearing in place is cheap.
    initFn.nodes.length = 0;
    for (const obj of this.objectiveDefs.values()) {
      initFn.nodes.push(scoreInitNode(obj));
    }

    // Inject call at start of load function
    const alreadyInjected = loadFn.nodes.some(
      (n) => n instanceof FunctionNode && n.name === initName,
    );

    if (!alreadyInjected) {
      loadFn.nodes.unshift(new FunctionNode(initName));
    }
  }
}
