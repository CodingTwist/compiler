// Build-time transforms over Minecraft structure (`.nbt`) assets.
//
// A structure stores only the cells it lists - unlisted cells in its bounding box
// are left untouched by `/place template`. We exploit that to make the
// materialize/dematerialize swap (see core/display/clip.ts) non-destructive to a
// cog's neighbours:
//
//   - restore  = `place template <name>`        - places the listed solid cells
//                back as their real blocks; neighbours (unlisted cells) untouched.
//   - clear    = `place template <name>_clear`   - a derived structure whose listed
//                solid cells become the author's chosen fill block (see
//                `Clip.clearWith`, e.g. an invisible `minecraft:barrier`) and whose
//                air cells are dropped, so materializing replaces only the cog's own
//                cells - leaving the neighbours the old `/fill … air` destroyed
//                untouched.
//
// Only a tiny slice of the NBT format appears in structure files, but we keep a
// faithful generic codec so re-serialised structures round-trip byte-for-byte.

import zlib from "zlib";

// --- NBT tag ids ------------------------------------------------------------
const END = 0;
const BYTE = 1;
const SHORT = 2;
const INT = 3;
const LONG = 4;
const FLOAT = 5;
const DOUBLE = 6;
const BYTE_ARRAY = 7;
const STRING = 8;
const LIST = 9;
const COMPOUND = 10;
const INT_ARRAY = 11;
const LONG_ARRAY = 12;

// A parsed tag keeps its id so it re-serialises with the exact same type. Scalars
// hold a JS primitive; compounds an ordered Map; lists their element id + items.
type Tag =
  | { id: 1 | 2 | 3 | 5 | 6; v: number }
  | { id: 4; v: bigint }
  | { id: 7; v: number[] }
  | { id: 8; v: string }
  | { id: 9; v: { elem: number; items: Tag[] } }
  | { id: 10; v: Map<string, Tag> }
  | { id: 11; v: number[] }
  | { id: 12; v: bigint[] };

// --- reader -----------------------------------------------------------------
class Reader {
  private i = 0;
  constructor(private readonly buf: Buffer) {}

  private u8() {
    return this.buf.readUInt8(this.i++);
  }
  private str() {
    const n = this.buf.readUInt16BE(this.i);
    this.i += 2;
    const s = this.buf.toString("utf8", this.i, this.i + n);
    this.i += n;
    return s;
  }
  private payload(id: number): Tag {
    switch (id) {
      case BYTE: {
        const v = this.buf.readInt8(this.i);
        this.i += 1;
        return { id: BYTE, v };
      }
      case SHORT: {
        const v = this.buf.readInt16BE(this.i);
        this.i += 2;
        return { id: SHORT, v };
      }
      case INT: {
        const v = this.buf.readInt32BE(this.i);
        this.i += 4;
        return { id: INT, v };
      }
      case LONG: {
        const v = this.buf.readBigInt64BE(this.i);
        this.i += 8;
        return { id: LONG, v };
      }
      case FLOAT: {
        const v = this.buf.readFloatBE(this.i);
        this.i += 4;
        return { id: FLOAT, v };
      }
      case DOUBLE: {
        const v = this.buf.readDoubleBE(this.i);
        this.i += 8;
        return { id: DOUBLE, v };
      }
      case BYTE_ARRAY: {
        const n = this.readI32();
        const a: number[] = [];
        for (let k = 0; k < n; k++) a.push(this.buf.readInt8(this.i++));
        return { id: BYTE_ARRAY, v: a };
      }
      case STRING:
        return { id: STRING, v: this.str() };
      case LIST: {
        const elem = this.u8();
        const n = this.readI32();
        const items: Tag[] = [];
        for (let k = 0; k < n; k++) items.push(this.payload(elem));
        return { id: LIST, v: { elem, items } };
      }
      case COMPOUND: {
        const m = new Map<string, Tag>();
        for (;;) {
          const tt = this.u8();
          if (tt === END) break;
          const name = this.str();
          m.set(name, this.payload(tt));
        }
        return { id: COMPOUND, v: m };
      }
      case INT_ARRAY: {
        const n = this.readI32();
        const a: number[] = [];
        for (let k = 0; k < n; k++) {
          a.push(this.buf.readInt32BE(this.i));
          this.i += 4;
        }
        return { id: INT_ARRAY, v: a };
      }
      case LONG_ARRAY: {
        const n = this.readI32();
        const a: bigint[] = [];
        for (let k = 0; k < n; k++) {
          a.push(this.buf.readBigInt64BE(this.i));
          this.i += 8;
        }
        return { id: LONG_ARRAY, v: a };
      }
      default:
        throw new Error(`unsupported NBT tag id ${id} at byte ${this.i}`);
    }
  }
  private readI32() {
    const v = this.buf.readInt32BE(this.i);
    this.i += 4;
    return v;
  }

  /** Read a root (named) compound. Structures always have an empty root name. */
  root(): { name: string; tag: Tag } {
    const id = this.u8();
    if (id !== COMPOUND) throw new Error("structure root is not a compound");
    const name = this.str();
    return { name, tag: this.payload(COMPOUND) };
  }
}

// --- writer -----------------------------------------------------------------
class Writer {
  private chunks: Buffer[] = [];

  private u8(n: number) {
    this.chunks.push(Buffer.from([n & 0xff]));
  }
  private i32(n: number) {
    const b = Buffer.alloc(4);
    b.writeInt32BE(n | 0);
    this.chunks.push(b);
  }
  private str(s: string) {
    const body = Buffer.from(s, "utf8");
    const head = Buffer.alloc(2);
    head.writeUInt16BE(body.length);
    this.chunks.push(head, body);
  }
  private payload(t: Tag) {
    switch (t.id) {
      case BYTE: {
        const b = Buffer.alloc(1);
        b.writeInt8(t.v);
        this.chunks.push(b);
        break;
      }
      case SHORT: {
        const b = Buffer.alloc(2);
        b.writeInt16BE(t.v);
        this.chunks.push(b);
        break;
      }
      case INT:
        this.i32(t.v);
        break;
      case LONG: {
        const b = Buffer.alloc(8);
        b.writeBigInt64BE(t.v);
        this.chunks.push(b);
        break;
      }
      case FLOAT: {
        const b = Buffer.alloc(4);
        b.writeFloatBE(t.v);
        this.chunks.push(b);
        break;
      }
      case DOUBLE: {
        const b = Buffer.alloc(8);
        b.writeDoubleBE(t.v);
        this.chunks.push(b);
        break;
      }
      case BYTE_ARRAY: {
        this.i32(t.v.length);
        for (const n of t.v) {
          const b = Buffer.alloc(1);
          b.writeInt8(n);
          this.chunks.push(b);
        }
        break;
      }
      case STRING:
        this.str(t.v);
        break;
      case LIST: {
        // Vanilla writes an empty list with element id END.
        this.u8(t.v.items.length === 0 ? END : t.v.elem);
        this.i32(t.v.items.length);
        for (const it of t.v.items) this.payload(it);
        break;
      }
      case COMPOUND: {
        for (const [name, child] of t.v) {
          this.u8(child.id);
          this.str(name);
          this.payload(child);
        }
        this.u8(END);
        break;
      }
      case INT_ARRAY: {
        this.i32(t.v.length);
        for (const n of t.v) this.i32(n);
        break;
      }
      case LONG_ARRAY: {
        this.i32(t.v.length);
        for (const n of t.v) {
          const b = Buffer.alloc(8);
          b.writeBigInt64BE(n);
          this.chunks.push(b);
        }
        break;
      }
    }
  }

  root(name: string, tag: Tag): Buffer {
    this.u8(COMPOUND);
    this.str(name);
    this.payload(tag);
    return Buffer.concat(this.chunks);
  }
}

// --- helpers ----------------------------------------------------------------
const AIR_NAMES = new Set([
  "minecraft:air",
  "minecraft:cave_air",
  "minecraft:void_air",
]);

function comp(tag: Tag): Map<string, Tag> {
  if (tag.id !== COMPOUND) throw new Error("expected compound");
  return tag.v;
}
function list(tag: Tag): Tag[] {
  if (tag.id !== LIST) throw new Error("expected list");
  return tag.v.items;
}

/** The author-chosen fill for a `_clear` variant (see `Clip.clearWith`). */
export type ClearFill = { Name: string; Properties?: Record<string, string> };

/**
 * Given a structure's raw (gzipped) bytes and the author's chosen `fill` block,
 * return the gzipped bytes of its `_clear` variant: every listed *solid* cell
 * becomes `fill`; every listed *air* cell is dropped (so those cells are left
 * untouched on placement). Per-block NBT is discarded; the fill's own block-state
 * properties (if any) are carried into the single-entry palette.
 */
export function deriveClearStructure(gz: Buffer, fill: ClearFill): Buffer {
  const { name, tag } = new Reader(zlib.gunzipSync(gz)).root();
  const root = comp(tag);

  // Which palette indices name an air block?
  const palette = list(root.get("palette")!);
  const airIndex = new Set<number>();
  palette.forEach((entry, idx) => {
    const nm = comp(entry).get("Name");
    if (nm && nm.id === STRING && AIR_NAMES.has(nm.v)) airIndex.add(idx);
  });

  // New single-entry palette: just the chosen fill block (+ its properties).
  const fillEntry = new Map<string, Tag>([
    ["Name", { id: STRING, v: fill.Name }],
  ]);
  if (fill.Properties && Object.keys(fill.Properties).length > 0) {
    fillEntry.set("Properties", {
      id: COMPOUND,
      v: new Map(
        Object.entries(fill.Properties).map(([k, val]) => [
          k,
          { id: STRING, v: val } as Tag,
        ]),
      ),
    });
  }
  const fillPalette: Tag = {
    id: LIST,
    v: { elem: COMPOUND, items: [{ id: COMPOUND, v: fillEntry }] },
  };

  // Keep every non-air cell, repointed to the barrier palette (state 0), pos only.
  const srcBlocks = list(root.get("blocks")!);
  const keptBlocks: Tag[] = [];
  for (const b of srcBlocks) {
    const m = comp(b);
    const state = m.get("state");
    const stateIdx = state && state.id === INT ? state.v : 0;
    if (airIndex.has(stateIdx)) continue; // listed air → leave the cell alone
    keptBlocks.push({
      id: COMPOUND,
      v: new Map<string, Tag>([
        ["state", { id: INT, v: 0 }],
        ["pos", m.get("pos")!],
      ]),
    });
  }

  const out = new Map<string, Tag>();
  out.set("size", root.get("size")!);
  out.set("entities", { id: LIST, v: { elem: END, items: [] } });
  out.set("palette", fillPalette);
  out.set("blocks", { id: LIST, v: { elem: COMPOUND, items: keptBlocks } });
  const dv = root.get("DataVersion");
  if (dv) out.set("DataVersion", dv);

  return zlib.gzipSync(new Writer().root(name, { id: COMPOUND, v: out }));
}
