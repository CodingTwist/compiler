// Renders a profile as a terminal summary or as folded stacks for a flame graph.
import type {
  ProfileDumpSpan,
  ProfileReport,
  ProfileSpanReport,
} from "./types";

/**
 * Folded-stack flame graph input (`a;b;command selfNs` per line), for speedscope or
 * flamegraph.pl.
 */
export function toFoldedStacks(raw: ProfileDumpSpan): string {
  return raw.frames
    .filter((f) => f.selfNs > 0)
    .map(
      (f) =>
        [...f.stack, f.command || "(entry)"]
          .map((s) => s.replace(/;/g, ","))
          .join(";") + ` ${f.selfNs}`,
    )
    .join("\n");
}

const ms = (ns: number) => (ns / 1e6).toFixed(3).padStart(10);
const clip = (s: string, n = 90) =>
  s.length > n ? `${s.slice(0, n - 3)}...` : s;

/** Human-readable summary of a {@link ProfileReport} for printing to a terminal. */
export function formatProfileReport(
  report: ProfileReport,
  opts: { top?: number } = {},
): string {
  const top = opts.top ?? 10;
  const ticks = Math.max(report.ticks, 1);
  const out: string[] = [];
  out.push(`Measured profile (${report.mc})`);
  out.push(
    `  ${report.ticks} ticks over ${(report.wallNs / 1e9).toFixed(1)}s: ` +
      `${(report.totalNs / 1e6).toFixed(3)} ms in commands, ${(report.totalNs / ticks / 1e6).toFixed(3)} ms/tick avg`,
  );
  out.push(
    `  static worst case: ${report.worstCaseCommandsPerTick} commands/tick`,
  );
  pushSpan(out, report, top, ticks);
  const w = report.worstTick;
  if (w.index >= 0) {
    out.push(`  worst tick #${w.index}: ${(w.ns / 1e6).toFixed(3)} ms`);
    pushSpan(out, w, Math.min(top, 5));
  }
  return out.join("\n");
}

function pushSpan(
  out: string[],
  span: ProfileSpanReport,
  top: number,
  ticks?: number,
): void {
  out.push(
    `    ${"total ms".padStart(10)} ${"self ms".padStart(10)} ${"calls".padStart(8)}${ticks ? " calls/tick" : ""}  function`,
  );
  for (const f of span.functions.slice(0, top)) {
    const perTick = ticks ? (f.calls / ticks).toFixed(2).padStart(11) : "";
    const cmds = f.commands === undefined ? "" : `  (${f.commands} cmds)`;
    out.push(
      `    ${ms(f.totalNs)} ${ms(f.selfNs)} ${String(f.calls).padStart(8)}${perTick}  ${f.fn}${cmds}`,
    );
  }
  out.push(`    ${"self ms".padStart(10)}  hottest commands`);
  for (const c of span.commands.slice(0, top)) {
    const at = c.line === undefined ? c.fn : `${c.fn}:${c.line}`;
    out.push(
      `    ${ms(c.selfNs)}  ${at}  ${clip(c.command || "(function entry)")}`,
    );
    if (c.source) out.push(`                ↳ ${c.source}`);
  }
}
