// The `helix.config.ts` contract: the pack describes itself, and helix creates, builds and
// writes it.
import type { Datapack } from "../core/ir/datapack";
import type { RuntimeTarget } from "../core/ir/target";
import type { DebugOptions } from "../core/debug/sources";
import type { VersionProfile } from "../versions/profile";

export type BuildMode = "dev" | "prod";

export interface HelixConfig {
  name: string;
  /** Minecraft version. Set it here or in the entry's `definePack({ version }, ...)`, not both. */
  version?: VersionProfile;
  /** Module (relative to the config) whose default export is a {@link PackEntry}. */
  entry: string;
  /** Runtimes to build. Default `["vanilla"]`; others write to `<out>-<target>`. */
  targets?: RuntimeTarget[];
  /** Output folders, relative to the config. `resourcePack` is only written when set. */
  out: { datapack: string; resourcePack?: string };
  /**
   * World save folder, where `helix profile` finds dumps. Default: two levels above
   * `out.datapack`.
   */
  world?: string;
  /** Debug source tracking, applied to dev builds only. */
  debug?: DebugOptions;
}

export interface BuildInfo {
  mode: BuildMode;
  target: RuntimeTarget;
}

/** A pack's authoring body: fill `dp`, which helix created from the config. */
export type PackEntry = ((dp: Datapack, build: BuildInfo) => void | Promise<void>) & PackOptions;

/** Build settings a pack entry may declare itself instead of in `helix.config.ts`. */
export interface PackOptions {
  version?: VersionProfile;
}

/** Identity helper so `helix.config.ts` gets type checking. */
export const defineConfig = (config: HelixConfig): HelixConfig => config;

/** Types a pack entry; `definePack({ version }, entry)` also sets its version. */
export function definePack(entry: PackEntry): PackEntry;
export function definePack(options: PackOptions, entry: PackEntry): PackEntry;
export function definePack(a: PackOptions | PackEntry, b?: PackEntry): PackEntry {
  return typeof a === "function" ? a : Object.assign(b!, a);
}
