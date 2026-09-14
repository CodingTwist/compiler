// Build-time transforms over structure (`.nbt`) files.
//
// `place template` leaves unlisted cells alone, so a derived `<name>_clear` structure (solid
// cells swapped for a fill block, air cells dropped) can hide a model's blocks without
// touching its neighbours. The NBT codec is generic so re-saved structures round-trip byte for byte.
export { deriveClearStructure, type ClearFill } from "./clear";
