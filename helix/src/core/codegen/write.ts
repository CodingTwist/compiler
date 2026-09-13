// The disk-writing half of codegen. Everything here touches `fs`/`path` (and,
// via structure.ts, `zlib`) - it is deliberately the ONLY codegen module that
// imports Node built-ins, so `codegen.ts` (buildDatapack/buildResourcePack) and
// the whole authoring import graph stay pure and browser-safe. Consumers reach
// this only through `dp.writeDatapack()` / `dp.writeResourcePack()`, which
// dynamic-import it lazily, so importing the compiler never pulls Node built-ins.
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

  // Everything under `data/<ns>/` is fully owned by this call, so anything there
  // that this build did not produce (a renamed advancement, a moved function)
  // is deleted - but unchanged files are left alone, so a rebuild touches only
  // what changed instead of rewriting the whole tree.
  syncFiles(outDir, collectDatapackFiles(dp), [path.join("data", dp.name)]);
  if (!sourceMapJson(dp)) {
    // a stale map from a debug build would lie
    fs.rmSync(path.join(outDir, SOURCE_MAP_FILE), { force: true });
  }
}

/**
 * Write `files` (path relative to `outDir` → bytes), skipping any whose on-disk
 * content already matches, then delete every file under the `owned` folders
 * that `files` does not name (and the directories that leaves empty).
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
 * `{ "<function>": { "<1-based .mcfunction line>": "<file>:<line>:<col>" } }`, or
 * `undefined` unless the pack was built with `debug.sources`/`comments`.
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

/**
 * Everything a loose-file `writeDatapack` would put on disk (generated JSON,
 * copied `.nbt` structures incl. derived `_clear` variants, `pack.mcmeta`),
 * collected in memory instead - shared by the zip branch above.
 */
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

  // `pack.mcmeta` below is written straight into outDir, and the per-file loop
  // only creates it as a side effect - so a pack with no models/assets at all
  // would never create it. Ensure it up front.
  fs.mkdirSync(outDir, { recursive: true });

  // The generated model/item trees are fully owned: anything there this build
  // did not produce is removed; copied assets and other namespaces are untouched.
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
 * Copy every file under each registered `addAssets` dir into the resource pack's
 * `assets/` tree, preserving subfolders (any extension - models, `.png`, …).
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
 * The `/place template` names this pack will actually ship - every `.nbt` under
 * every directory registered with {@link Datapack.addStructures}, relative and
 * extension-stripped, exactly as {@link writeDatapack} will emit them (`cog.nbt`
 * in a source dir -> `cog`, so the id is `<ns>:cog`).
 *
 * Reading the set back off the datapack rather than off a path constant lets a
 * consumer validate its own references against the same set the build copies - a
 * level naming a template that was never staged can fail the build instead of
 * failing silently in-game as an empty room.
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
