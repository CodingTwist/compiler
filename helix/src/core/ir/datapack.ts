// Top of `Datapack`: entry points (`load`, `tick`, `after`, periodic hooks) and output.
import { buildDatapack } from "../codegen/codegen";
import {
  analyzeCost,
  CostReport,
  formatCostReport,
  type LintRule,
} from "../report/cost-report";
import {
  analyzeProfile,
  formatProfileReport,
  type ProfileReport,
  type ProfileDump,
} from "../report/profile-report";
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
   * Writes the datapack to `outputPath`.
   * Async because the disk code is imported lazily, keeping helix browser-safe.
   */
  async writeDatapack(outputPath: string, opts?: { zip?: boolean }) {
    this.prepareForCodegen();
    const { writeDatapack } = await import("../codegen/write.js");
    writeDatapack(this, outputPath, opts); //call back codegen
  }

  /**
   * Writes the resource pack to `outputPath`, separate from {@link writeDatapack}. Async
   * for the same reason.
   */
  async writeResourcePack(outputPath: string) {
    this.prepareForCodegen();
    const { writeResourcePack } = await import("../codegen/write.js");
    writeResourcePack(this, outputPath);
  }

  /** Runs finalizers and injects load setup before codegen. Idempotent. */
  private prepareForCodegen() {
    this.runFinalizers();
    this.ensureLoadInitializers();
  }

  /**
   * Static per-tick cost report: worst-case commands per tick and unbounded `@e` scans.
   * Runs codegen first; call when authoring is done. See {@link formatCostReport}.
   */
  report(): CostReport {
    this.prepareForCodegen();
    buildDatapack(this); // populate dp.files; idempotent (cached per function)
    return analyzeCost(this);
  }

  /**
   * Matches a measured profile from the helix-profiler mod to this pack's functions and
   * lines.
   * See {@link formatProfileReport}.
   */
  profileReport(raw: ProfileDump): ProfileReport {
    this.prepareForCodegen();
    buildDatapack(this);
    return analyzeProfile(this, raw);
  }

  /** Convenience: run {@link profileReport} and print the formatted summary. */
  printProfileReport(raw: ProfileDump): ProfileReport {
    const report = this.profileReport(raw);
    console.log(formatProfileReport(report));
    return report;
  }

  /** Per lint rule, the functions whose hits are intentional, with why - see {@link allow}. */
  readonly allowed = new Map<LintRule, Map<string, string>>();

  /**
   * Marks `fn`'s hits of lint `rule` as intentional, including functions it calls.
   * Keep the expensive commands in their own function so new ones elsewhere still warn.
   */
  allow(rule: LintRule, fn: FunctionRef | string, reason: string): void {
    const fns = this.allowed.get(rule) ?? new Map<string, string>();
    fns.set(typeof fn === "string" ? fn : fn.getName(), reason);
    this.allowed.set(rule, fns);
  }

  /** {@link allow} for `"nbt-read"`: NBT reads faster than the t5 clock. */
  allowNbtRead(fn: FunctionRef | string, reason: string): void {
    this.allow("nbt-read", fn, reason);
  }

  /** Convenience: run {@link report} and print the formatted summary. */
  printReport(): CostReport {
    const report = this.report();
    console.log(formatCostReport(report));
    return report;
  }

  /**
   * A function that runs every `seconds` seconds. `phase` staggers it; see {@link
   * everyTicks}.
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
   * A function that runs every `ticks` ticks. `phase` offsets it so same-period hooks
   * spread out.
   */
  everyTicks(ticks: number, phase = 0): FunctionRef {
    return this.timing.everyTicks(this, ticks, `${ticks}t`, phase);
  }

  // `dp.clip()` and friends are added by `spool`, not part of the core.

  /** Append to the `load` function (runs on pack load / `/reload`). */
  load(builder: (ctx: FunctionContext) => void): FunctionRef {
    const ref = this.getOrCreateFunction("load", "load");
    ref.build(builder);
    return ref;
  }

  /**
   * Runs `build` once after `time`:
   *
   *   dp.after(ctx, Time.seconds(3), (c) => c.say("done"));
   *
   * The body goes in an auto-named child function, so you don't invent a name. `append`
   * queues
   * instead of replacing a pending run. Not a coroutine: the body runs later at the world
   * origin
   * as the server, so it must set its own `as`/`at`.
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

    // Rebuild from the current objectives each time, since more may be added between
    // codegen calls.
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
