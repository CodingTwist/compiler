// `validateDatapack`: writes the pack's JSON to a temp folder and checks it with Spyglass.
import os from "os";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { Datapack } from "../core/ir/datapack";
import { buildDatapack } from "../core/codegen/codegen";
import { buildPackMcmeta } from "../core/codegen/mcmeta";
import { loadSpyglass, SEVERITY } from "./spyglass";
import {
  declaredSymbols,
  isDeclaredByPack,
  isRegistryFile,
  offsetToLineCol,
} from "./symbols";
import type { McdocDiagnostic, ValidateOptions } from "./types";

/**
 * Validates a pack's emitted JSON against the vanilla schema. Returns diagnostics (empty =
 * clean).
 * Only throws on setup problems (missing packages, no network on first run).
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

  // Write the pack to a temp folder so Spyglass can pick schemas by file path.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "helix-mcdoc-"));
  const cacheDir =
    opts.cacheDir ?? path.join(os.homedir(), ".cache", "helix-mcdoc");
  fs.mkdirSync(cacheDir, { recursive: true });

  const files = buildDatapack(dp);
  const declared = declaredSymbols(files);
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
        if (isDeclaredByPack(err.message, declared)) continue;
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
