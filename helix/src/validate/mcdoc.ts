// Optional build-time validation of a pack's emitted JSON resources against the
// vanilla schema for its target version, via Spyglass's mcdoc runtime.
//
// This is deliberately OFF to the side of the core: it validates *rendered JSON*
// (loot tables, predicates, advancements, tags, and - the main motivation -
// `dp.registryFile(...)` escape-hatch resources), the one authoring seam where
// helix hands out raw JSON instead of typed values. It reads rendered output,
// the same stance as `dp.report()` - never the AST.
//
// The Spyglass packages (`@spyglassmc/core`, `mcdoc`, `java-edition`) are
// OPTIONAL peer tooling: they are declared in `optionalDependencies` and pulled
// in lazily by `import()` below, so the core compiler and every consumer that
// only calls `writeDatapack`/`report` never loads them. `validateDatapack`
// throws a clear install hint if they're absent.
//
// On first run for a version, java-edition fetches vanilla-mcdoc + the mcmeta
// summary and caches them under `cacheRoot`; subsequent runs are offline.

import os from "os";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { Datapack } from "../core/ir/datapack";
import { buildDatapack, buildPackMcmeta } from "../core/codegen/codegen";

export interface McdocDiagnostic {
  /** Datapack-relative path of the offending file, e.g. `data/foo/dimension/x.json`. */
  file: string;
  /** 1-based line/column of the problem within that file. */
  line: number;
  column: number;
  severity: "error" | "warning" | "info" | "hint";
  message: string;
}

export interface ValidateOptions {
  /**
   * Minecraft version to validate against. Defaults to the pack's target
   * profile id (`dp.version.id`). Override when the profile id isn't a release
   * Spyglass/mcmeta recognises (e.g. a snapshot alias).
   */
  gameVersion?: string;
  /**
   * Where Spyglass caches vanilla-mcdoc + the mcmeta summary between runs.
   * Defaults to `~/.cache/helix-mcdoc`. Deleting it forces a re-fetch.
   */
  cacheDir?: string;
  /**
   * Restrict validation to the `dp.registryFile(...)` escape-hatch resources
   * (the raw-JSON seam) rather than every emitted `.json`. Off by default:
   * validating everything also cross-checks the typed builders' output against
   * the vanilla schema.
   */
  registryFilesOnly?: boolean;
}

// Spyglass's `ErrorSeverity` enum (note: inverted from LSP's numbering).
const SEVERITY: Record<number, McdocDiagnostic["severity"]> = {
  0: "hint",
  1: "info",
  2: "warning",
  3: "error",
};

/** Map a 0-based character offset in `text` to a 1-based line/column. */
function offsetToLineCol(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let last = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === "\n") {
      line++;
      last = i + 1;
    }
  }
  return { line, column: offset - last + 1 };
}

// The Spyglass packages are optional peer deps loaded lazily and carry no usable
// runtime types at this boundary; `any` here is the deliberate untyped edge, kept
// contained to this loader (callers use the returned namespaces directly).
/* eslint-disable @typescript-eslint/no-explicit-any */
async function loadSpyglass(): Promise<{
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

/**
 * Validate a pack's emitted JSON resources against the vanilla schema for its
 * target version. Returns a flat list of diagnostics (empty = clean). Does not
 * throw on validation problems - only on setup failure (missing packages, no
 * network on the first fetch for a version).
 *
 * @example
 *   const problems = await validateDatapack(dp);
 *   if (problems.length) console.error(formatMcdocDiagnostics(problems));
 */
export async function validateDatapack(
  dp: Datapack,
  opts: ValidateOptions = {},
): Promise<McdocDiagnostic[]> {
  const gameVersion = opts.gameVersion ?? dp.version.id;
  const { core, mcdoc, je, NodeJsExternals } = await loadSpyglass();

  // Materialise the pack into a throwaway datapack root so Spyglass's uri-binder
  // can dispatch each file to its schema from the on-disk path.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "helix-mcdoc-"));
  const cacheDir =
    opts.cacheDir ?? path.join(os.homedir(), ".cache", "helix-mcdoc");
  fs.mkdirSync(cacheDir, { recursive: true });

  const files = buildDatapack(dp);
  const relPaths: string[] = [];
  const contents = new Map<string, string>();
  for (const [rel, content] of files) {
    if (!rel.endsWith(".json")) continue; // skip .mcfunction, structures, …
    if (opts.registryFilesOnly && !isRegistryFile(dp, rel)) continue;
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, "utf-8");
    relPaths.push(rel);
    contents.set(rel, content);
  }

  // pack.mcmeta is required for Spyglass to recognise the root as a datapack.
  fs.writeFileSync(
    path.join(root, "pack.mcmeta"),
    JSON.stringify(buildPackMcmeta(dp), null, 2),
    "utf-8",
  );

  const rootUri = pathToFileURL(root).toString() + "/";
  const cacheUri = pathToFileURL(cacheDir).toString() + "/";
  const quietLogger = { log() {}, warn() {}, error() {}, info() {} };

  const project = new core.Project({
    logger: quietLogger,
    cacheRoot: cacheUri,
    projectRoots: [rootUri],
    externals: NodeJsExternals,
    initializers: [mcdoc.initialize, je.initialize],
    defaultConfig: core.ConfigService.merge(core.VanillaConfig, {
      env: { gameVersion },
    }),
  });

  const diagnostics: McdocDiagnostic[] = [];
  try {
    await project.init();
    await project.ready();

    for (const rel of relPaths) {
      const content = contents.get(rel)!;
      const fileUri = rootUri + rel.split(path.sep).join("/");
      await project.onDidOpen(fileUri, "json", 1, content);
      const checked = await project.ensureClientManagedChecked(fileUri);
      if (!checked) continue;
      for (const err of core.FileNode.getErrors(checked.node)) {
        const offset =
          typeof err.range?.start === "number" ? err.range.start : 0;
        const { line, column } = offsetToLineCol(content, offset);
        diagnostics.push({
          file: rel,
          line,
          column,
          severity: SEVERITY[err.severity] ?? "error",
          message: err.message,
        });
      }
    }
  } finally {
    await project.close?.();
    fs.rmSync(root, { recursive: true, force: true });
  }

  return diagnostics;
}

/** Is `rel` one of the pack's `dp.registryFile(...)` resources? */
function isRegistryFile(dp: Datapack, rel: string): boolean {
  const prefix = `data/${dp.name}/`;
  if (!rel.startsWith(prefix)) return false;
  const inner = rel.slice(prefix.length, -".json".length);
  return dp.registryFileDefs.has(inner);
}

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
