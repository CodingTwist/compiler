// Syncs files into an owned output folder, and walks source folders.
import fs from "fs";
import path from "path";

/**
 * Writes `files` (skipping unchanged ones), then deletes anything under `owned` that
 * `files`
 * doesn't list, plus empty directories.
 */
export function syncFiles(outDir: string, files: Map<string, Buffer>, owned: string[]) {
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

/** Relative paths of every file under `root`, recursing into subfolders. */
export function walkFiles(root: string, prefix = ""): string[] {
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
export function walkNbt(root: string, prefix = ""): string[] {
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
