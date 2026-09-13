// The `helix.config.ts` contract: the pack describes itself and helix owns creating
// the Datapack, calling the entry, and writing / reporting on the result.
import type { Datapack } from "../core/ir/datapack";
import type { RuntimeTarget } from "../core/ir/target";
import type { DebugOptions } from "../core/debug/sources";
import type { VersionProfile } from "../versions/profile";

export type BuildMode = "dev" | "prod";

export interface HelixConfig {
  name: string;
  version: VersionProfile;
  /** Module (relative to the config) whose default export is a {@link PackEntry}. */
  entry: string;
  /** Runtimes to build. Default `["vanilla"]`; others write to `<out>-<target>`. */
  targets?: RuntimeTarget[];
  /** Output folders, relative to the config. `resourcePack` is only written when set. */
  out: { datapack: string; resourcePack?: string };
  /**
   * World save folder, for `helix profile` to find `helix-profile/` dumps. Default: two
   * levels above `out.datapack` (`<world>/datapacks/<pack>`).
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
export type PackEntry = (dp: Datapack, build: BuildInfo) => void | Promise<void>;

/** Identity helper so `helix.config.ts` gets type checking. */
export const defineConfig = (config: HelixConfig): HelixConfig => config;

/** Identity helper so a pack entry gets its parameter types. */
export const definePack = (entry: PackEntry): PackEntry => entry;
