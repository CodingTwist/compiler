// HAND-WRITTEN. The whole `scoreboard` family.
//
// Every command is a literal spine plus a few named args, so one node and handler covers
// them.
// Named args let `buildCommand` reorder them for the target version; see
// version_breaking_change.test.ts.
//
// Registered via EXTRA_HANDLERS in scripts/gen-commands.mjs.
export * from "./nodes";
export * from "./handler";
