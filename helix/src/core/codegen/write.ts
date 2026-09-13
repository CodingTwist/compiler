// Writes packs to disk. The only codegen module that imports Node built-ins, so the rest
// stays
// browser-safe. Reached through `dp.writeDatapack()` / `dp.writeResourcePack()`, which
// import it lazily.
import fs from "fs";
import path from "path";
import { Datapack } from "../ir/datapack";
import { buildDatapack, buildResourcePack, buildPackMcmeta } from "./codegen";
import { deriveClearStructure } from "./structure";
import { buildZip } from "./zip";

export function writeDatapack(dp: Datapack, outDir: string, opts?: { zip?: boolean }) {
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

/**
 * Writes `files` (skipping unchanged ones), then deletes anything under `owned` that
 * `files`
 * doesn't list, plus empty directories.
 */
function syncFiles(outDir: string, files: Map<string, Buffer>, owned: string[]) {
  const stale = new Set<string>();
  for (const dir of owned) {
    const full = path.join(outDir, dir);
    if (!fs.existsSync(full)) continue;
    for (const rel of walkFiles(full)) stale.add(path.join(dir, rel).split(path.sep).join("/"));
  }
  for (const [rel, content] of files) {
    stale.delete(rel);
    const full = path.join(outDir, rel);
    if (fs.existsSync(full) && fs.readFileSync(full).equals(content)) continue;
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  for (const rel of stale) fs.rmSync(path.join(outDir, rel));
  for (const dir of owned) pruneEmptyDirs(path.join(outDir, dir));
}

/** Remove `dir` if it is (or becomes) empty; recurses first. */
function pruneEmptyDirs(dir: string) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) pruneEmptyDirs(path.join(dir, entry.name));
  }
  if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
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
  for (const [fn, locs] of [...dp.sourceMap].sort(([a], [b]) => a.localeCompare(b))) {
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

      const key = rel.replace(/\.nbt$/, "").split(path.sep).join("/");
      const fill = clearVariants.get(key);
      if (fill) {
        const clearDest = dest.replace(/\.nbt$/, "_clear.nbt");
        files.set(clearDest, deriveClearStructure(content, fill));
      }
    }
  }

  files.set("pack.mcmeta", Buffer.from(JSON.stringify(buildPackMcmeta(dp), null, 2), "utf-8"));
  const sources = sourceMapJson(dp);
  if (sources) files.set(SOURCE_MAP_FILE, Buffer.from(sources, "utf-8"));

  return files;
}

export function writeResourcePack(dp: Datapack, outDir: string) {
  const files = buildResourcePack(dp);

  // Create outDir up front; a pack with no models or assets wouldn't otherwise create it.
  fs.mkdirSync(outDir, { recursive: true });

  // Generated model and item folders are owned: stale files are removed. Copied assets are
  // untouched.
  syncFiles(
    outDir,
    new Map([...files].map(([p, c]) => [p, Buffer.from(c, "utf-8")])),
    ["models", "items"].map((gen) => path.join("assets", dp.name, gen)),
  );

  // Copy any verbatim assets (pre-made models, textures, custom-block assets).
  copyAssets(dp, outDir);

  // Resource-pack pack.mcmeta uses the version's RESOURCE format, not the data one.
  fs.writeFileSync(
    path.join(outDir, "pack.mcmeta"),
    JSON.stringify(buildPackMcmeta(dp, dp.version.resourcePack), null, 2),
  );
}

/**
 * Copies each `addAssets` directory into the resource pack's `assets/`, keeping subfolders.
 */
function copyAssets(dp: Datapack, outDir: string) {
  for (const dir of dp.assetSources) {
    if (!fs.existsSync(dir)) {
      throw new Error(`addAssets: directory does not exist: ${dir}`);
    }
    for (const rel of walkFiles(dir)) {
      const dest = path.join(outDir, "assets", rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(dir, rel), dest);
    }
  }
}

/** Relative paths of every file under `root`, recursing into subfolders. */
function walkFiles(root: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(path.join(root, prefix), {
    withFileTypes: true,
  })) {
    const rel = path.join(prefix, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(root, rel));
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

/** Relative paths of every `.nbt` file under `root`, recursing into subfolders. */
/**
 * The `/place template` names this pack will ship, e.g. `cog.nbt` becomes `cog`.
 *
 * Lets consumers check their template references against what the build actually copies.
 */
export function shippedStructureNames(dp: Datapack): Set<string> {
  const names = new Set<string>();
  for (const dir of dp.structureSources) {
    for (const rel of walkNbt(dir)) {
      names.add(rel.replace(/\.nbt$/, "").split(path.sep).join("/"));
    }
  }
  return names;
}

function walkNbt(root: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(path.join(root, prefix), {
    withFileTypes: true,
  })) {
    const rel = path.join(prefix, entry.name);
    if (entry.isDirectory()) out.push(...walkNbt(root, rel));
    else if (entry.isFile() && entry.name.endsWith(".nbt")) out.push(rel);
  }
  return out;
}
