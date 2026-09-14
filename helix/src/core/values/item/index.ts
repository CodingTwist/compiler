// Items: `Item.DIAMOND_SWORD.named("Excalibur").enchant("sharpness", 5)`.
//
// One `ItemValue` renders per version (components on 1.20.5+, NBT before) and per use (give
// stack, item predicate, components map, stack NBT), so an item always matches its own predicate.
export { ItemValue, Item } from "./value";
export { ItemBuilder } from "./builder";
export type { TextComponent } from "./text";
/** Typed vanilla item tag ids, e.g. `ITEM_TAGS.PLANKS`. */
export { ITEM_TAGS } from "../../../versions/data/ids";
