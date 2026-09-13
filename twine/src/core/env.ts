import type { BuildEnv } from "./module.interface";

/**
 * The build environment, resolved once for the whole build.
 *
 * The factory prunes modules by env and modules check {@link isDev}; both must see the same value,
 * or debug commands could ship in prod. `TWINE_ENV` is the fallback before the factory runs.
 */

/** The env the factory resolved, or `TWINE_ENV=prod` (anything else is `"dev"`). */
export function buildEnv(): BuildEnv {
  return resolved ?? (process.env.TWINE_ENV === "prod" ? "prod" : "dev");
}

let resolved: BuildEnv | undefined;

/** Publish the resolved env. Called by `DatapackFactory.create`; rarely by hand. */
export function setBuildEnv(env: BuildEnv): void {
  resolved = env;
}

/** Whether to build debug/admin commands. Prod packs ship without them. */
export function isDev(): boolean {
  return buildEnv() === "dev";
}
