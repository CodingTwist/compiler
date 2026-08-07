import type { BuildEnv } from "./module.interface";

/**
 * The build environment, as one resolved value the whole build agrees on.
 *
 * `env` gates two different things: which modules the factory *keeps* (an
 * `env: ["dev"]` module is pruned from the graph), and what a kept module
 * chooses to *emit* (a debug/admin function guarded by {@link isDev}). Those
 * must be the same answer - a pack that reads `process.env` itself for the
 * second one can disagree with what `DatapackFactory.create` was actually
 * passed for the first, and ship debug commands in a prod build.
 *
 * So the factory publishes the env it resolved ({@link setBuildEnv}) and
 * everything else reads it back ({@link buildEnv}) - the same attach/current
 * shape as {@link Logger}. Before the factory runs, and for consumers not using
 * it, {@link currentEnv} is the fallback.
 */

/** `TWINE_ENV=prod ...`; anything else (including unset) is `"dev"`. */
export function currentEnv(): BuildEnv {
  return process.env.TWINE_ENV === "prod" ? "prod" : "dev";
}

/** The env the factory resolved, once it has. */
let resolved: BuildEnv | undefined;

/** Publish the resolved env. Called by `DatapackFactory.create`; rarely by hand. */
export function setBuildEnv(env: BuildEnv): void {
  resolved = env;
}

/** The env this build is targeting - the factory's, or {@link currentEnv} if none ran. */
export function buildEnv(): BuildEnv {
  return resolved ?? currentEnv();
}

/** Whether debug/admin commands should be built. Prod packs ship without them. */
export function isDev(): boolean {
  return buildEnv() === "dev";
}
