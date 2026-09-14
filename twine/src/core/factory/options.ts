// The options `DatapackFactory.create` takes.
import type { DebugOptions, RuntimeTarget, VersionProfile } from "helix";
import type { BuildEnv } from "../module.interface";

export interface FactoryOptions {
  /** Datapack name (also the output namespace). */
  name: string;
  /** Target version profile. Default {@link v1_20_4}. */
  version?: VersionProfile;
  /** Build environment. Modules for other envs are pruned. Default: {@link buildEnv}. */
  env?: BuildEnv;
  /**
   * Runtime target (`"vanilla"` | `"paper"`), for `ctx.native(...)`. Default `"vanilla"`.
   */
  target?: RuntimeTarget;
  /**
   * Debug-only build settings, off by default. `sources` maps commands to source lines;
   * `comments` also writes them into the pack.
   */
  debug?: DebugOptions;
}
