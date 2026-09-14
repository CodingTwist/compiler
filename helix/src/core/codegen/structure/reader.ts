// Reads a binary NBT buffer into tags, keeping each tag's type id.
import {
  BYTE,
  BYTE_ARRAY,
  COMPOUND,
  DOUBLE,
  END,
  FLOAT,
  INT,
  INT_ARRAY,
  LIST,
  LONG,
  LONG_ARRAY,
  SHORT,
  STRING,
  type Tag,
} from "./tags";

export class Reader {
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
