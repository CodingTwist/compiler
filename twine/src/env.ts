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
 * everything else reads it back ({@link buildEnv}). Before the factory runs,
 * and for consumers not using it, `TWINE_ENV` is the fallback.
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

/** Whether debug/admin commands should be built. Prod packs ship without them. */
export function isDev(): boolean {
  return buildEnv() === "dev";
}
