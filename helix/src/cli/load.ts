// Loads a pack from its `helix.config.ts` and creates one Datapack per target. Needs a
// TypeScript-capable loader (the `helix` bin runs under tsx; vitest works too).
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { Datapack } from "../core/ir/datapack";
import type { RuntimeTarget } from "../core/ir/target";
import type { BuildMode, HelixConfig, PackEntry } from "./config";

export const CONFIG_FILE = "helix.config.ts";

export interface LoadedPack {
  target: RuntimeTarget;
  dp: Datapack;
  /** Absolute output folders for this target. */
  out: { datapack: string; resourcePack?: string };
}

export interface LoadResult {
  config: HelixConfig;
  root: string;
  packs: LoadedPack[];
}

/**
 * A module's default export, through however many CJS interop `default` wrappers. Plain
 * `import()`: the `helix` bin runs this under tsx, so `.ts` files load as-is.
 */
async function importDefault<T>(file: string): Promise<T> {
  let mod = (await import(pathToFileURL(file).href)) as { default?: unknown };
  while (mod && typeof mod === "object" && "default" in mod) mod = mod.default as typeof mod;
  return mod as T;
}

export async function loadPack(opts: {
  root?: string;
  mode: BuildMode;
  target?: RuntimeTarget;
}): Promise<LoadResult> {
  const root = path.resolve(opts.root ?? process.cwd());
  const configFile = path.join(root, CONFIG_FILE);
  if (!fs.existsSync(configFile)) throw new Error(`helix: no ${CONFIG_FILE} in ${root}`);
  const envFile = path.join(root, ".env");
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

  const config = await importDefault<HelixConfig>(configFile);
  const entry = await importDefault<PackEntry>(path.resolve(root, config.entry));
  if (typeof entry !== "function") {
    throw new Error(`helix: ${config.entry} must default-export a pack function (dp, build) => void`);
  }

  const targets = opts.target ? [opts.target] : (config.targets ?? ["vanilla"]);
  const packs: LoadedPack[] = [];
  for (const target of targets) {
    const suffix = target === "vanilla" ? "" : `-${target}`;
    const dp = new Datapack(config.name, config.version, target, {
      debug: opts.mode === "dev" ? config.debug : undefined,
    });
    await entry(dp, { mode: opts.mode, target });
    packs.push({
      target,
      dp,
      out: {
        datapack: path.resolve(root, config.out.datapack) + suffix,
        // The resource pack is client assets, identical across targets.
        resourcePack: config.out.resourcePack && path.resolve(root, config.out.resourcePack),
      },
    });
  }
  return { config, root, packs };
}

/** Where `helix profile` looks for dumps: `config.world`, else two above the datapack. */
export function worldDir({ config, root }: LoadResult): string {
  return config.world
    ? path.resolve(root, config.world)
    : path.resolve(root, config.out.datapack, "../..");
}
