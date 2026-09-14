// Node entry point: the shared API plus Node-only version constants and `validateDatapack`.
// Browser bundles use `helix/browser`.
export * from "./public-api";

// Version profiles loaded from disk at import. Node-only.
export { v1_20_1, v1_20_4, v1_21_4, v26_1_2, v26_2, v26_3_rc_2 } from "./versions/profiles";

// Template names a build will ship, for validating references. Node-only.
export { shippedStructureNames } from "./core/codegen/write";

// The newest helix-profiler dump for a world. Node-only.
export { latestProfile, PROFILE_DIR } from "./core/report/profile-file";

// The `helix` CLI's pack contract: `helix.config.ts` + a pack entry function.
export {
  defineConfig,
  definePack,
  type HelixConfig,
  type PackEntry,
  type PackOptions,
  type BuildInfo,
  type BuildMode,
} from "./cli/config";
export { loadPack, type LoadResult, type LoadedPack } from "./cli/load";

// Optional validation of emitted JSON against vanilla schemas (Spyglass, loaded lazily).
// Node-only.
export {
  validateDatapack,
  formatMcdocDiagnostics,
  type McdocDiagnostic,
  type ValidateOptions,
} from "./validate";

// export * from "./core/visualize";
