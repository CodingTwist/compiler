import type { NbtRead } from "./types";

/** Reads at this period or slower (the t5 clock) aren't warned about. */
export const NBT_READ_MIN_PERIOD = 5;

/** Entity/block NBT reads, which serialize the whole entity. Storage reads don't count. */
export const NBT_READ =
  /nbt=|data get (entity|block)|(if|unless) data (entity|block)|from (entity|block)/;

/** Item-holding NBT: `if items` reads the slot without serialising the entity. */
export const ITEM_NBT =
  /\b(SelectedItem|Inventory|EnderItems|equipment|HandItems|ArmorItems|Items?)\b/;

export function nbtReadHint(line: string): string | undefined {
  if (ITEM_NBT.test(line)) {
    return "item checks don't need NBT: `execute if items entity|block <target> <slot> <item>`";
  }
  if (/nbt=|(data get|if data|unless data|from) entity/.test(line)) {
    return "if an entity predicate (flags, equipment, vehicle, location, effects…) or a selector argument covers this field, check that instead";
  }
  return undefined;
}

/** Identical reads in one function (the same line twice) → one entry with a count. */
export function collapseReads(reads: NbtRead[]): NbtRead[] {
  const out = new Map<string, NbtRead>();
  for (const r of reads) {
    const seen = out.get(`${r.fn}|${r.line}`);
    if (seen) seen.count = (seen.count ?? 1) + 1;
    else out.set(`${r.fn}|${r.line}`, { ...r });
  }
  return [...out.values()];
}
