// NBT tag ids and the parsed tag shape shared by the structure reader and writer.

export const END = 0;
export const BYTE = 1;
export const SHORT = 2;
export const INT = 3;
export const LONG = 4;
export const FLOAT = 5;
export const DOUBLE = 6;
export const BYTE_ARRAY = 7;
export const STRING = 8;
export const LIST = 9;
export const COMPOUND = 10;
export const INT_ARRAY = 11;
export const LONG_ARRAY = 12;

// A parsed tag keeps its type id so it re-serialises identically.
export type Tag =
  | { id: 1 | 2 | 3 | 5 | 6; v: number }
  | { id: 4; v: bigint }
  | { id: 7; v: number[] }
  | { id: 8; v: string }
  | { id: 9; v: { elem: number; items: Tag[] } }
  | { id: 10; v: Map<string, Tag> }
  | { id: 11; v: number[] }
  | { id: 12; v: bigint[] };

export function comp(tag: Tag): Map<string, Tag> {
  if (tag.id !== COMPOUND) throw new Error("expected compound");
  return tag.v;
}
export function list(tag: Tag): Tag[] {
  if (tag.id !== LIST) throw new Error("expected list");
  return tag.v.items;
}
