// Typed block-entity NBT per block entity type.
//
//   Chest({ items: [{ slot: 0, item: Item.DIAMOND }] })
//     // -> {Items:[{Slot:0b,id:"minecraft:diamond",count:1}]}
//
// Fields are camelCase; helix handles keys, SNBT types and version changes. No raw-key
// escape hatch: fix missing fields in `scripts/gen-block-entity-nbt.mjs`. Schemas are in
// `block-entities.generated.ts`.
export * from "./fields";
export * from "./value";
export * from "./define";
