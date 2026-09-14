// Top of `Datapack`: writing the packs, reports and periodic hooks.
import { buildDatapack } from "../../codegen/codegen";
import { analyzeCost, CostReport, formatCostReport, type LintRule } from "../../report/cost";
import {
  analyzeProfile,
  formatProfileReport,
  type ProfileReport,
  type ProfileDump,
} from "../../report/profile";
import { FunctionRef } from "../../function_ref";
import { TICKS_PER_SECOND } from "../../timing/scoreboard-timing";
import { DatapackEntry } from "./entry";

export class Datapack extends DatapackEntry {
  /**
   * Writes the datapack to `outputPath`.
   * Async because the disk code is imported lazily, keeping helix browser-safe.
   */
  async writeDatapack(outputPath: string, opts?: { zip?: boolean }) {
    this.prepareForCodegen();
    const { writeDatapack } = await import("../../codegen/write/index.js");
    writeDatapack(this, outputPath, opts); //call back codegen
  }

  /**
   * Writes the resource pack to `outputPath`, separate from {@link writeDatapack}. Async
   * for the same reason.
   */
  async writeResourcePack(outputPath: string) {
    this.prepareForCodegen();
    const { writeResourcePack } = await import("../../codegen/write/index.js");
    writeResourcePack(this, outputPath);
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

  private explicitAllows = new Map<LintRule, Map<string, string>>();

  /** Per lint rule, the functions whose hits are intentional, with why - from {@link allow} and `ctx.allow`. */
  get allowed(): Map<LintRule, Map<string, string>> {
    const all = new Map([...this.explicitAllows].map(([rule, fns]) => [rule, new Map(fns)]));
    for (const fn of this.functions.values()) {
      for (const [rule, reason] of fn.allows) {
        all.set(rule, (all.get(rule) ?? new Map()).set(fn.name, reason));
      }
    }
    return all;
  }

  /**
   * Marks `fn`'s hits of lint `rule` as intentional, including functions it calls.
   * Keep the expensive commands in their own function so new ones elsewhere still warn.
   * Inside the function's builder, `ctx.allow` does the same without naming it.
   */
  allow(rule: LintRule, fn: FunctionRef | string, reason: string): void {
    const fns = this.explicitAllows.get(rule) ?? new Map<string, string>();
    fns.set(typeof fn === "string" ? fn : fn.getName(), reason);
    this.explicitAllows.set(rule, fns);
  }

  /** {@link allow} for `"nbt-read"`: NBT reads faster than the t5 clock. */
  allowNbtRead(fn: FunctionRef | string, reason: string): void {
    this.allow("nbt-read", fn, reason);
  }

  /** Convenience: run {@link report} and print the formatted summary. */
  printReport(): CostReport {
    const report = this.report();
    const color = !!globalThis.process?.stdout?.isTTY && !process.env.NO_COLOR;
    console.log(formatCostReport(report, { color }));
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
}
