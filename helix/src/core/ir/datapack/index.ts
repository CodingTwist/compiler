// `Datapack`: the pack being authored. `new Datapack("name", v1_21_4)`, then `dp.tick(...)` etc.
//
// One class to authors, built as a chain of layers so each file holds one area:
// core → functions → tags → data → assets → entry → datapack.
export { Datapack } from "./datapack";
export type { FunctionTag, OptimizeOptions } from "./core";
export { type RegistryTag } from "./tags";
export { splitDefName } from "./data";
export { serializeItemDef, type ItemDefinition } from "./assets";
