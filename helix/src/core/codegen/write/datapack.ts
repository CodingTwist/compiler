// Writes the datapack to a folder or zip.
import fs from "fs";
import path from "path";
import { Datapack } from "../../ir/datapack";
import { buildDatapack } from "../codegen";
import { buildPackMcmeta } from "../mcmeta";
import { deriveClearStructure } from "../structure";
import { buildZip } from "../zip";
import { syncFiles, walkNbt } from "./sync";

export function writeDatapack(
  dp: Datapack,
  outDir: string,
  opts?: { zip?: boolean },
) {
  if (opts?.zip) {
    const files = collectDatapackFiles(dp);
    fs.mkdirSync(path.dirname(outDir), { recursive: true });
    fs.writeFileSync(outDir, buildZip(files));
    return;
  }

  // This build owns `data/<ns>/`: files it didn't produce are deleted, unchanged files are
  // left alone.
  syncFiles(outDir, collectDatapackFiles(dp), [path.join("data", dp.name)]);
  if (!sourceMapJson(dp)) {
    // a stale map from a debug build would lie
    fs.rmSync(path.join(outDir, SOURCE_MAP_FILE), { force: true });
  }
}

/** Debug sidecar at the pack root (Minecraft ignores unknown root files). */
export const SOURCE_MAP_FILE = "helix-sources.json";

/**
 * `{ "<function>": { "<line>": "<file>:<line>:<col>" } }`, or `undefined` without debug
 * sources.
 */
function sourceMapJson(dp: Datapack): string | undefined {
  if (!dp.debug.sources && !dp.debug.comments) return undefined;
  const out: Record<string, Record<string, string>> = {};
  for (const [fn, locs] of [...dp.sourceMap].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const lines: Record<string, string> = {};
    locs.forEach((loc, i) => {
      if (loc) lines[i + 1] = loc;
    });
    if (Object.keys(lines).length > 0) out[fn] = lines;
  }
  return JSON.stringify(out, null, 2);
}

/** Everything `writeDatapack` would write, in memory. Used for zip output. */
function collectDatapackFiles(dp: Datapack): Map<string, Buffer> {
  const files = new Map<string, Buffer>();

  for (const [filePath, content] of buildDatapack(dp)) {
    files.set(filePath, Buffer.from(content, "utf-8"));
  }

  const folder = dp.version.paths.structure;
  const clearVariants = dp.clearStructureVariants;
  for (const dir of dp.structureSources) {
    if (!fs.existsSync(dir)) {
      throw new Error(`addStructures: directory does not exist: ${dir}`);
    }
    for (const rel of walkNbt(dir)) {
      const src = path.join(dir, rel);
      const dest = path.join("data", dp.name, folder, rel);
      const content = fs.readFileSync(src);
      files.set(dest, content);

      const key = rel
        .replace(/\.nbt$/, "")
        .split(path.sep)
        .join("/");
      const fill = clearVariants.get(key);
      if (fill) {
        const clearDest = dest.replace(/\.nbt$/, "_clear.nbt");
        files.set(clearDest, deriveClearStructure(content, fill));
      }
    }
  }

  files.set(
    "pack.mcmeta",
    Buffer.from(JSON.stringify(buildPackMcmeta(dp), null, 2), "utf-8"),
  );
  const sources = sourceMapJson(dp);
  if (sources) files.set(SOURCE_MAP_FILE, Buffer.from(sources, "utf-8"));

  return files;
}

/**
 * The `/place template` names this pack will ship, e.g. `cog.nbt` becomes `cog`.
 *
 * Lets consumers check their template references against what the build actually copies.
 */
export function shippedStructureNames(dp: Datapack): Set<string> {
  const names = new Set<string>();
  for (const dir of dp.structureSources) {
    for (const rel of walkNbt(dir)) {
      names.add(
        rel
          .replace(/\.nbt$/, "")
          .split(path.sep)
          .join("/"),
      );
    }
  }
  return names;
}
