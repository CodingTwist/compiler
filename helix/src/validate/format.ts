// Formats mcdoc diagnostics for logging.
import type { McdocDiagnostic } from "./types";

/** Render diagnostics as a compact, `file:line:col` block for logging. */
export function formatMcdocDiagnostics(diagnostics: McdocDiagnostic[]): string {
  if (diagnostics.length === 0) return "mcdoc: no problems found.";
  const lines = diagnostics.map(
    (d) => `  ${d.file}:${d.line}:${d.column} [${d.severity}] ${d.message}`,
  );
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  return (
    `mcdoc: ${diagnostics.length} problem(s), ${errors} error(s):\n` +
    lines.join("\n")
  );
}
