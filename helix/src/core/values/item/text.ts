// Item text (names, lore, book pages) in each form a version or use needs.
import { NbtInput } from "../nbt";
import { textJson as tellrawJson } from "../text-json";
import { TellrawPart } from "../../frontend/nodes/tellraw_part";

/**
 * Text for item names and lore: a string or a styled text component object.
 *
 *   item.named("Excalibur")
 *   item.named({ text: "Time Lantern", color: "aqua", italic: false })
 */
export type TextComponent = string | Record<string, unknown>;

/** Normalize either form to a text-component object. */
function textObj(value: TextComponent): Record<string, unknown> {
  return typeof value === "string" ? { text: value } : value;
}

/** Pre-1.20.5 text: a quoted JSON string, e.g. `'{"text":"Excalibur"}'`. */
export function textSnbt(value: TextComponent): string {
  return `'${JSON.stringify(textObj(value))}'`;
}

/**
 * 1.20.5+ text: an SNBT compound, not a quoted string.
 * Quoting it shows the raw JSON in game and breaks `match_tool`.
 */
export function textCompound(value: TextComponent): string {
  return JSON.stringify(textObj(value));
}

/** JSON text component - the predicate form of the above. */
export function textJson(value: TextComponent): Record<string, unknown> {
  return textObj(value);
}

/** A book page as a text compound. Typed as a record so a JSON string page can't compile. */
export function pageJson(
  page: TellrawPart | string | TellrawPart[],
): Record<string, NbtInput> {
  if (Array.isArray(page)) {
    return { text: "", extra: page.map((part) => tellrawJson(part)) };
  }
  return typeof page === "string" ? { text: page } : tellrawJson(page);
}
