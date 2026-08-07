// Node entry point. The environment-agnostic surface lives in `./public-api`
// (shared with the browser build); this adds the Node-only pieces: the eager
// version constants (they read data from disk at import time) and
// `validateDatapack` (Spyglass + `fs`). For a browser bundle import `helix/browser`.
export * from "./public-api";

// Eager, disk-backed version profiles (`loadProfile` reads `data/<ver>.json` at
// import time). Node-only - the browser builds profiles via `profileFromRaw`.
export { v1_20_1 } from "./versions/1_20_1";
export { v1_20_4 } from "./versions/1_20_4";
export { v1_21_4 } from "./versions/1_21_4";
export { v26_1_2 } from "./versions/26_1_2";
export { v26_2 } from "./versions/26_2";

// The structure template names a build will ship, read off the dirs registered
// with `addStructures` - for consumers validating their own template references
// against what actually gets copied. Reads from disk, so Node-only.
export { shippedStructureNames } from "./core/codegen/write";

// Opt-in build-time validation of emitted JSON resources against the vanilla
// schema for the target version (via Spyglass's mcdoc runtime). The Spyglass
// packages are optional deps, loaded lazily - importing these symbols does not
// pull them into the core's runtime; only calling `validateDatapack` does. Reads
// from disk, so Node-only.
export {
  validateDatapack,
  formatMcdocDiagnostics,
  type McdocDiagnostic,
  type ValidateOptions,
} from "./validate/mcdoc";

// export * from "./core/visualize";
