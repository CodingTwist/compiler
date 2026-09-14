// Typed entity NBT per entity type.
//
//   Tnt({ fuse: 40, blockState: Block.SAND, motion: [0, 1, 0] })
//     // 1.21.4 -> {fuse:40s,block_state:{Name:"minecraft:sand"},Motion:[0.0d,1.0d,0.0d]}
//     // 1.20.1 -> {Fuse:40s,Motion:[0.0d,1.0d,0.0d]}   (no block_state before 1.20.3)
//
// Fields are camelCase; helix handles keys, SNBT types and version changes. No raw-key escape
// hatch: fix missing fields in `scripts/gen-entity-nbt.mjs`. Schemas are in `entities.generated.ts`.
export * from "./fields";
export * from "./value";
export * from "./define";
