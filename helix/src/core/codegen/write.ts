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

export function writeDatapack(dp: Datapack, outDir: string) {
  const files = buildDatapack(dp);

  // Clear this namespace's generated function tree first so a rebuild never
  // leaves orphaned `.mcfunction` files behind (e.g. helpers that were renamed
  // or whose source was deleted). Scoped to the fully-generated function folder
  // - structures, pack.mcmeta and other namespaces are untouched.
  const fnDir = path.join(
    outDir,
    "data",
    dp.name,
    dp.version.paths.function,
  );
  fs.rmSync(fnDir, { recursive: true, force: true });

  for (const [filePath, content] of files) {
    const fullPath = path.join(outDir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, "utf-8");
  }

  // Copy any static structure (.nbt) assets into the version's structure folder.
  copyStructures(dp, outDir);

  // Generate pack.mcmeta from the target version's pack-format spec.
  fs.writeFileSync(
    path.join(outDir, "pack.mcmeta"),
    JSON.stringify(buildPackMcmeta(dp), null, 2),
  );
}

export function writeResourcePack(dp: Datapack, outDir: string) {
  const files = buildResourcePack(dp);

  // Clear this namespace's generated model/item trees first so a rebuild never
  // leaves orphaned JSON behind (renamed/deleted models). Scoped to the
  // fully-generated folders - copied assets and other namespaces are untouched.
  for (const gen of ["models", "items"]) {
    fs.rmSync(path.join(outDir, "assets", dp.name, gen), {
      recursive: true,
      force: true,
    });
  }

  for (const [filePath, content] of files) {
    const fullPath = path.join(outDir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, "utf-8");
  }

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

/**
 * Copy every `.nbt` under each registered structure source dir into
 * `data/<ns>/<structure folder>/<relative path>.nbt`, preserving subfolders so
 * a file `cog.nbt` is reachable as the template id `<ns>:cog`.
 */
function copyStructures(dp: Datapack, outDir: string) {
  const folder = dp.version.paths.structure;
  const clearVariants = dp.clearStructureVariants;
  for (const dir of dp.structureSources) {
    if (!fs.existsSync(dir)) {
      throw new Error(`addStructures: directory does not exist: ${dir}`);
    }
    for (const rel of walkNbt(dir)) {
      const src = path.join(dir, rel);
      const dest = path.join(outDir, "data", dp.name, folder, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      // Only ship a `_clear` variant when a clip explicitly asked for one (via
      // `clearWith`), filled with the block it chose - see core/codegen/structure.ts.
      const key = rel.replace(/\.nbt$/, "").split(path.sep).join("/");
      const fill = clearVariants.get(key);
      if (fill) {
        const clearDest = dest.replace(/\.nbt$/, "_clear.nbt");
        fs.writeFileSync(
          clearDest,
          deriveClearStructure(fs.readFileSync(src), fill),
        );
      }
    }
  }
}

/** Relative paths of every `.nbt` file under `root`, recursing into subfolders. */
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
