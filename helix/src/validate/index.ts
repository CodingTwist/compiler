// Optional validation of a pack's emitted JSON against the vanilla schema, using Spyglass.
//
// Mainly for `dp.registryFile(...)` resources, where helix hands out raw JSON. Spyglass
// packages are optional and loaded lazily; `validateDatapack` explains how to install them.
// The first run per version downloads schemas into the cache; later runs are offline.
export { validateDatapack } from "./mcdoc";
export { formatMcdocDiagnostics } from "./format";
export type { McdocDiagnostic, ValidateOptions } from "./types";
