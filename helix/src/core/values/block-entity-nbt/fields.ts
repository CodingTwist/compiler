// Block-entity-only field encoders. Reuses entity-nbt's version-gated encoder vocabulary
// (field/atLeast/asByte/asDoubles/asFloats/asList/asText) rather than duplicating it.
import { atLeast } from "../entity-nbt/fields";
import type { VersionProfile } from "../../../versions/profile";
import { Byte } from "../nbt";
import type { NbtInput } from "../nbt";
import type { ItemValue } from "../item";

export {
  field,
  atLeast,
  asByte,
  asDoubles,
  asFloats,
  asList,
  asText,
  type FieldEncoder,
  type McVersion,
} from "../entity-nbt/fields";

/**
 * One item in a container's `Items` list. `slot` is optional so this also covers a partial
 * `block_predicate` NBT match ("holds this item somewhere"), which vanilla matches by item
 * id alone regardless of slot - omitting it renders just the stack, with no `Slot` key.
 */
export interface SlottedItem {
  readonly slot?: number;
  readonly item: ItemValue;
}
export type SlottedItems = readonly SlottedItem[];

/**
 * A chest/dispenser/hopper/shelf `Items` list. Each element renders through the item's own
 * `toStackNbt`, so the item stack keeps its normal 1.20.5+ components / legacy NBT split -
 * only the sibling `Slot` key is spliced in ahead of it.
 */
export const asItems = (v: SlottedItems, version: VersionProfile): NbtInput =>
  v.map(({ slot, item }): NbtInput => {
    const stack = item.toStackNbt(version); // "{id:...,count:...}" or "{id:...,tag:{...}}"
    return slot === undefined
      ? { render: () => stack }
      : { render: () => `{Slot:${Byte(slot).render()},${stack.slice(1)}` };
  });

/** A sign face's `front_text`/`back_text`. */
export interface SignTextInput {
  /** Up to 4 lines of text. */
  readonly messages: readonly string[];
  /** Shown to players with the profanity filter enabled on Realms. Defaults to `messages`. */
  readonly filteredMessages?: readonly string[];
  readonly color?: string;
  readonly hasGlowingText?: boolean;
}

// Sign text switched from a JSON string per line to a text compound in 1.21.5 - same gate
// `asText` uses for other display names.
const signLine = (line: string, version: VersionProfile): NbtInput =>
  atLeast(version, "1.21.5") ? { text: line } : JSON.stringify({ text: line });

export const asSignText = (v: SignTextInput, version: VersionProfile): NbtInput => {
  const out: Record<string, NbtInput> = {
    messages: v.messages.map((l) => signLine(l, version)),
  };
  if (v.filteredMessages)
    out.filtered_messages = v.filteredMessages.map((l) => signLine(l, version));
  if (v.color !== undefined) out.color = v.color;
  if (v.hasGlowingText !== undefined) out.has_glowing_text = Byte(v.hasGlowingText ? 1 : 0);
  return out;
};

/** Decorated-pot `sherds`, 26.3+ shape (one sherd item id per side). */
export interface PotDecorationsInput {
  readonly back?: string;
  readonly left?: string;
  readonly right?: string;
  readonly front?: string;
}

/**
 * 26.3+ `sherds` is a per-side compound; before that it was a plain list of up to 4 item
 * ids. Decorated pots have no real usage in this codebase yet, so the pre-26.3 shape is
 * intentionally not modeled - falls back to whichever sides are given, in list form.
 * ponytail: pre-26.3 fidelity unverified in-game; verify against a real 1.20.x pot before
 * relying on it for an old-version target.
 */
export const asPotDecorations = (
  v: PotDecorationsInput,
  version: VersionProfile,
): NbtInput =>
  atLeast(version, "26.3")
    ? { ...v }
    : [v.back, v.left, v.right, v.front].filter((x): x is string => x !== undefined);
