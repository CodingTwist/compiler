// Loads the optional Spyglass packages on demand and maps their severities.
import type { McdocDiagnostic } from "./types";

// Spyglass's `ErrorSeverity` enum (note: inverted from LSP's numbering).
export const SEVERITY: Record<number, McdocDiagnostic["severity"]> = {
  0: "hint",
  1: "info",
  2: "warning",
  3: "error",
};

// Spyglass is loaded lazily with no usable types, so `any` is contained to this loader.
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function loadSpyglass(): Promise<{
  core: any;
  mcdoc: any;
  je: any;
  NodeJsExternals: any;
}> {
  try {
    const [core, mcdoc, je, nodejs] = await Promise.all([
      import("@spyglassmc/core"),
      import("@spyglassmc/mcdoc"),
      import("@spyglassmc/java-edition"),
      import("@spyglassmc/core/lib/nodejs.js"),
    ]);
    return { core, mcdoc, je, NodeJsExternals: (nodejs as any).NodeJsExternals };
  } catch (e) {
    throw new Error(
      "helix JSON validation needs the optional Spyglass packages. Install them with:\n" +
        "  npm i -D @spyglassmc/core @spyglassmc/mcdoc @spyglassmc/java-edition\n" +
        `(underlying error: ${(e as Error).message})`,
    );
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
