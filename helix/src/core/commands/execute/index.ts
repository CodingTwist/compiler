// A general typed `execute` chain builder: `ctx.execute().as(sel).ifScore(...).run(...)`.
//
// Composes context shifts, stores and `if/unless` guards in author order, then one `run`.
// Values render through their typed classes; only keywords are literal. Everything after the
// leading `execute` is `raw`, because the validator can't follow execute's redirects.
// Registered via EXTRA_HANDLERS in scripts/gen-commands.mjs, never regenerated.
export * from "./types";
export * from "./shifts";
export * from "./builder";
export * from "./handler";
// Must be `export *`: it carries the `ctx.execute()` augmentation, which consumers only see through the barrel.
export * from "./methods";
