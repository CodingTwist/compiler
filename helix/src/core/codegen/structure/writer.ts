// Writes tags back to binary NBT, byte for byte as vanilla would.
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

export class Writer {
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
