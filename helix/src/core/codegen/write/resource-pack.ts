// Writes the resource pack to a folder.
import fs from "fs";
import path from "path";
import { Datapack } from "../../ir/datapack";
import { buildResourcePack } from "../resource-pack";
import { buildPackMcmeta } from "../mcmeta";
import { syncFiles, walkFiles } from "./sync";

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
