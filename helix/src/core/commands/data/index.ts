// `ctx.data()`: HAND-WRITTEN PROTOTYPE of the grouped-builder + per-leaf-union shape.
//
// Subset only; the generator will emit all ~100 modify leaves. Kept by HAND_REFINED in
// scripts/gen-commands.mjs, so regeneration leaves this folder alone.
export * from "./args";
export * from "./builders";
export { DataHandler } from "./handler";
// Must be `export *`: it carries the `ctx.data()` augmentation, which consumers only see through the barrel.
export * from "./method";
