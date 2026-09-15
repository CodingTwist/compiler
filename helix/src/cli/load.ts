// Loads a pack from `helix.config.ts` and creates one Datapack per target. Needs a TS
// loader (tsx or vitest).
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { Datapack } from "../core/ir/datapack";
import type { RuntimeTarget } from "../core/ir/target";
import type { BuildMode, HelixConfig, PackEntry } from "./config";
import type { DebugOptions } from "../core/debug/sources";
import type { OptimizeOptions } from "../core/ir/datapack";
import type { VersionProfile } from "../versions/profile";

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

/** A module's default export, unwrapping any CJS interop `default` layers. */
async function importDefault<T>(file: string): Promise<T> {
  let mod = (await import(pathToFileURL(file).href)) as { default?: unknown };
  while (mod && typeof mod === "object" && "default" in mod)
    mod = mod.default as typeof mod;
  return mod as T;
}

export async function loadPack(opts: {
  root?: string;
  mode: BuildMode;
  target?: RuntimeTarget;
  /** Overrides `config.debug`, in any mode. */
  debug?: DebugOptions;
  /** Overrides the config/entry version, e.g. from `--version`. */
  version?: VersionProfile;
  /** Merged over `config.optimize`, e.g. from `--no-inline`/`--no-group`. */
  optimize?: OptimizeOptions;
  /** Passed to the entry as `build.only`, e.g. from `--only`. */
  only?: string[];
}): Promise<LoadResult> {
  const root = path.resolve(opts.root ?? process.cwd());
  const configFile = path.join(root, CONFIG_FILE);
  if (!fs.existsSync(configFile))
    throw new Error(`helix: no ${CONFIG_FILE} in ${root}`);
  const envFile = path.join(root, ".env");
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

  const config = await importDefault<HelixConfig>(configFile);
  const entry = await importDefault<PackEntry>(
    path.resolve(root, config.entry),
  );
  if (typeof entry !== "function") {
    throw new Error(
      `helix: ${config.entry} must default-export a pack function (dp, build) => void`,
    );
  }

  if (entry.version && config.version) {
    throw new Error(
      `helix: version is set in both ${CONFIG_FILE} and ${config.entry} - keep one`,
    );
  }
  const version = opts.version ?? entry.version ?? config.version;
  if (!version)
    throw new Error(
      `helix: no version - set it in ${CONFIG_FILE} or definePack({ version }, ...)`,
    );

  const targets = opts.target ? [opts.target] : (config.targets ?? ["vanilla"]);
  const packs: LoadedPack[] = [];
  for (const target of targets) {
    const suffix = target === "vanilla" ? "" : `-${target}`;
    const dp = new Datapack(config.name, version, target, {
      debug: opts.debug ?? (opts.mode === "dev" ? config.debug : undefined),
      optimize: { ...config.optimize, ...opts.optimize },
    });
    await entry(dp, { mode: opts.mode, target, only: opts.only });
    packs.push({
      target,
      dp,
      out: {
        datapack: path.resolve(root, config.out.datapack) + suffix,
        // The resource pack is client assets, identical across targets.
        resourcePack:
          config.out.resourcePack &&
          path.resolve(root, config.out.resourcePack),
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
