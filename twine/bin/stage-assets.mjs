#!/usr/bin/env node
// twine-stage-assets - mirror a twine consumer's non-source files from its
// source tree into the compiled output, preserving relative paths, so a prod
// build (`node dist/main.js`) finds its assets next to the emitted `.js` via
// `path.join(__dirname, ...)` exactly as the tsx dev run finds them in `src/`.
//
// tsc only emits `.ts` → `.js`; it drops everything else. Structure `.nbt`
// templates and resource-pack textures live beside the source that registers
// them (`dp.addStructures(...)` / `dp.addAssets(...)`), so they must be staged
// into `dist/` too. This is generic framework plumbing - a consumer shouldn't
// re-invent it. Run it after `tsc` in the package's `build` script.
//
// Usage: twine-stage-assets [srcDir=src] [distDir=dist]
// Copies every file whose extension is NOT a TS/JS source or doc extension.
import { cp, readdir } from "node:fs/promises";
import path from "node:path";

const [, , srcArg = "src", distArg = "dist"] = process.argv;
const SRC = path.resolve(srcArg);
const DIST = path.resolve(distArg);

// A denylist, not an allowlist: an asset is anything that isn't source or docs,
// so a consumer never has to maintain a per-project extension list.
const SKIP = new Set([
  ".ts", ".tsx", ".mts", ".cts", ".d.ts",
  ".js", ".jsx", ".mjs", ".cjs", ".map",
  ".md",
]);

let count = 0;
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(abs);
    } else if (!SKIP.has(path.extname(entry.name))) {
      const rel = path.relative(SRC, abs);
      await cp(abs, path.join(DIST, rel), { recursive: false });
      console.log(`staged ${rel}`);
      count++;
    }
  }
}

await walk(SRC);
console.log(`twine-stage-assets: ${count} asset(s) → ${path.relative(process.cwd(), DIST)}`);
