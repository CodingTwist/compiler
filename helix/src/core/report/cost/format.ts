import type { CostReport } from "./types";
import { NBT_READ_MIN_PERIOD } from "./nbt-reads";

/**
 * Human-readable summary of a {@link CostReport} for printing to a terminal.
 * Pass `color` only when writing to a TTY; the codes are noise in files and pipes.
 */
export function formatCostReport(report: CostReport, { color = false } = {}): string {
  const sgr = (code: string) => (s: string | number) => (color ? `\x1b[${code}m${s}\x1b[0m` : `${s}`);
  const bold = sgr("1"), dim = sgr("2"), red = sgr("31"), green = sgr("32"), yellow = sgr("33"), cyan = sgr("36");
  const warn = sgr("1;33")("WARN");
  const out: string[] = [];
  out.push(bold("Per-tick cost report"));
  out.push(
    `  worst case: ${bold(report.totalWorstCaseCommandsPerTick)} commands/tick ` +
      `across ${report.tickRoots.length} tick root(s)`,
  );
  for (const r of report.tickRoots) {
    out.push(
      `    ${cyan(r.root)}: ${bold(r.worstCaseCommands)} cmds, ` +
        `${r.reachableFunctions} fn(s)${r.recursive ? yellow(" (recursive - lower bound)") : ""}`,
    );
    // Per-call-site breakdown, skipped for flat bodies.
    if (r.breakdown.length > 0) {
      if (r.selfCommands > 0) out.push(`      · self: ${bold(r.selfCommands)} cmds`);
      for (const c of r.breakdown) {
        const guard = c.guard ? dim(`  ⟵ ${c.guard}`) : "";
        out.push(
          `      · ${cyan(c.callee)}: ${bold(c.commands)} cmds, ${c.functions} fn(s)${guard}`,
        );
      }
    }
  }
  if (report.unboundedScanners.length === 0) {
    out.push(green("  no unbounded @e scans reachable from tick ✓"));
  } else {
    out.push(
      red(`  ${report.unboundedScanners.length} function(s) with unbounded @e scans:`),
    );
    for (const fn of report.unboundedScanners) {
      out.push(`    ${cyan(fn.name)}: ${fn.unboundedScans.join(", ")}`);
      for (const loc of new Set(fn.scanSources)) if (loc) out.push(dim(`      ↳ ${loc}`));
    }
  }
  for (const w of report.warnings) {
    const line = w.line.length > 120 ? `${w.line.slice(0, 117)}...` : w.line;
    out.push(
      `  ${warn} ${yellow("nbt read")} ${w.guarded ? "up to " : ""}every ${w.period} tick(s) in ${cyan(w.fn)}: ${line}${w.count ? ` (×${w.count})` : ""}\n` +
        (w.hint ? green(`       → ${w.hint}`) + "\n" : "") +
        green(`       → move it to a t5/t10/t20 clock, or dp.allow("nbt-read", "${w.fn}", why)`),
    );
    if (w.source) out.push(dim(`       ↳ ${w.source}`));
  }
  const allowed = report.nbtReads.filter((r) => r.allowed && r.period < NBT_READ_MIN_PERIOD);
  if (allowed.length > 0) {
    const why = [...new Set(allowed.map((r) => `${r.fn} (${r.allowed})`))];
    out.push(dim(`  ${allowed.length} allowed fast nbt read(s): ${why.join(", ")}`));
  }
  for (const l of report.lints) {
    const line = l.line.length > 120 ? `${l.line.slice(0, 117)}...` : l.line;
    const every = l.period ? ` (${l.guarded ? "up to " : ""}every ${l.period} tick(s))` : "";
    const more = l.count ? ` (+${l.count - 1} similar)` : "";
    out.push(
      `  ${warn} ${yellow(l.rule)} in ${cyan(l.fn)}${every}: ${line}${more}\n` +
        green(`       → ${l.hint}`) + "\n" +
        green(`       → or dp.allow("${l.rule}", "${l.fn}", why)`),
    );
    if (l.source) out.push(dim(`       ↳ ${l.source}`));
  }
  const byRule = new Map<string, Set<string>>();
  for (const l of report.allowedLints) {
    byRule.set(l.rule, (byRule.get(l.rule) ?? new Set()).add(`${l.fn} (${l.allowed})`));
  }
  for (const [rule, fns] of byRule) out.push(dim(`  allowed ${rule}: ${[...fns].join(", ")}`));
  for (const { rule, fn } of report.staleAllows) {
    out.push(`  ${warn} dp.allow("${rule}", "${fn}") names no function - renamed or moved? It silences nothing`);
  }
  return out.join("\n");
}
