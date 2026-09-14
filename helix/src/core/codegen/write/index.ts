// Writes packs to disk. The only codegen module that imports Node built-ins, so the rest
// stays browser-safe. Reached through `dp.writeDatapack()` / `dp.writeResourcePack()`,
// which import it lazily.
export { SOURCE_MAP_FILE, shippedStructureNames, writeDatapack } from "./datapack";
export { writeResourcePack } from "./resource-pack";
