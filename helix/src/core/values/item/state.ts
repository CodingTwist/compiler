// What an item has been told, before it is rendered for a version or use.
import { normalizeId } from "../../../versions/registry";
import { VersionProfile } from "../../../versions/profile";
import { TellrawPart } from "../../frontend/nodes/tellraw_part";
import { ModelRef } from "../model";
import { CommandValue } from "../value";
import type { TextComponent } from "./text";

/** The settings behind an `ItemValue`. */
export interface ItemState {
  id: string;
  data?: string;
  count?: number;
  customName?: TextComponent;
  customModelData?: number;
  itemModel?: ModelRef | string;
  enchantments: [string | CommandValue, number][];
  lore: TextComponent[];
  canPlaceOn: string[];
  writtenBook?: {
    title: string;
    author: string;
    pages: (TellrawPart | string | TellrawPart[])[];
  };
  extraComponents: {
    stack: string | ((version: VersionProfile) => string);
    key?: string;
    json?: unknown;
  }[];
  subPredicates: { type: string; json: unknown }[];
}

/** Whether any structured data/components have been defined. */
export function hasStructuredData(s: ItemState): boolean {
  return (
    s.customName !== undefined ||
    s.customModelData !== undefined ||
    s.itemModel !== undefined ||
    s.enchantments.length > 0 ||
    s.lore.length > 0 ||
    s.canPlaceOn.length > 0 ||
    s.writtenBook !== undefined ||
    s.extraComponents.length > 0
  );
}

/** The normalized item id with no data/components (`minecraft:diamond`, `#minecraft:planks`). */
export function baseId(s: ItemState): string {
  return s.id.startsWith("#")
    ? "#" + normalizeId(s.id.slice(1))
    : normalizeId(s.id);
}
