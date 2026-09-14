// Lowers an item's settings to pre-1.20.5 NBT.
import { VersionProfile } from "../../../versions/profile";
import { legacyModelData, renderEnchId } from "./components";
import type { ItemState } from "./state";
import { textSnbt } from "./text";

/** Pre-1.20.5 NBT fragments (between the `{}`). */
export function legacyNbt(s: ItemState, version: VersionProfile): string {
  if (s.writtenBook !== undefined) {
    throw new Error(
      `Item.writtenBook() needs data components (1.20.5+); target version ${version.id} predates them.`,
    );
  }
  const nbt: string[] = [];
  const display: string[] = [];
  if (s.customName !== undefined) {
    display.push(`Name:${textSnbt(s.customName)}`);
  }
  if (s.lore.length > 0) {
    display.push(`Lore:[${s.lore.map(textSnbt).join(",")}]`);
  }
  if (display.length) nbt.push(`display:{${display.join(",")}}`);
  if (s.customModelData !== undefined) {
    nbt.push(`CustomModelData:${s.customModelData}`);
  }
  if (s.itemModel !== undefined) {
    nbt.push(`CustomModelData:${legacyModelData(s.itemModel, version)}`);
  }
  if (s.enchantments.length > 0) {
    const entries = s.enchantments
      .map(([e, l]) => `{id:"${renderEnchId(e, version)}",lvl:${l}}`)
      .join(",");
    nbt.push(`Enchantments:[${entries}]`);
  }
  if (s.canPlaceOn.length > 0) {
    nbt.push(`CanPlaceOn:[${s.canPlaceOn.map((b) => `"${b}"`).join(",")}]`);
  }
  return nbt.join(",");
}
