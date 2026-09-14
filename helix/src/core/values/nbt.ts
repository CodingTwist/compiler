import { VersionProfile } from "../../versions/profile";
import { CommandValue } from "./value";

/**
 * Values the SNBT serializer accepts: primitives, arrays, objects, typed numbers, or any
 * `CommandValue`.
 */
export type NbtInput =
  | string
  | number
  | boolean
  | NbtNum
  | NbtIntArray
  | CommandValue
  | NbtInput[]
  | { [key: string]: NbtInput };

/**
 * A number with an SNBT type suffix (`0.0f`, `64b`…). Use {@link Float}, {@link Double} and
 * friends.
 */
export class NbtNum {
  constructor(
    readonly value: number,
    readonly suffix: "" | "b" | "s" | "l" | "f" | "d",
    /** Force a decimal point even on whole numbers (`0` -> `0.0f`). */
    private readonly decimal = false,
  ) {}

  render(): string {
    let n = String(this.value);
    if (this.decimal && Number.isInteger(this.value)) n = `${n}.0`;
    return n + this.suffix;
  }
}

/** `1.0f` - a 32-bit float (decimal point always emitted). */
export const Float = (n: number): NbtNum => new NbtNum(n, "f", true);
/** `1.0d` - a 64-bit double (decimal point always emitted). */
export const Double = (n: number): NbtNum => new NbtNum(n, "d", true);
/** `1b` - a byte (also how booleans are commonly written). */
export const Byte = (n: number): NbtNum => new NbtNum(n, "b");
/** `1s` - a short. */
export const Short = (n: number): NbtNum => new NbtNum(n, "s");
/** `1l` - a long. */
export const Long = (n: number): NbtNum => new NbtNum(n, "l");

/** `[I;1,2,3]`: an int array, used for UUIDs and block positions. */
export class NbtIntArray {
  constructor(private readonly values: readonly number[]) {}
  render(): string {
    return `[I;${this.values.join(",")}]`;
  }
}

export const IntArray = (values: readonly number[]): NbtIntArray => new NbtIntArray(values);

const BARE_KEY = /^[A-Za-z0-9_.+-]+$/;

/** Control characters with short SNBT escapes, matching vanilla; others use `\xHH`. */
const CONTROL_ESCAPE: Readonly<Record<number, string>> = {
  8: "b", 9: "t", 10: "n", 12: "f", 13: "r",
};

/**
 * Quotes a string, escaping control characters like vanilla does.
 * An unescaped newline would split the command across lines and fail to parse.
 */
function quote(s: string): string {
  return `"${s.replace(/[\\"\x00-\x1f]/g, (ch) => {
    if (ch === "\\" || ch === '"') return "\\" + ch;
    const code = ch.charCodeAt(0);
    const named = CONTROL_ESCAPE[code];
    return named !== undefined ? `\\${named}` : `\\x${code.toString(16).padStart(2, "0")}`;
  })}"`;
}

function isCommandValue(x: unknown): x is CommandValue {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as CommandValue).render === "function" &&
    !(x instanceof NbtNum)
  );
}

/**
 * Quotes an embedded value if SNBT won't accept it bare, e.g. an id with a colon.
 * Compounds and lists are left as rendered.
 */
function embed(rendered: string): string {
  if (rendered.startsWith("{") || rendered.startsWith("[")) return rendered;
  return BARE_KEY.test(rendered) ? rendered : quote(rendered);
}

/** Serialize a JS value to SNBT, rendering any embedded `CommandValue`. */
export function toSnbt(value: NbtInput, version: VersionProfile): string {
  if (value instanceof NbtNum) return value.render();
  if (value instanceof NbtIntArray) return value.render();
  if (isCommandValue(value)) return embed(value.render(version));
  if (typeof value === "string") return quote(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => toSnbt(v, version)).join(",")}]`;
  }
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  return `{${entries
    .map(([k, v]) => `${BARE_KEY.test(k) ? k : quote(k)}:${toSnbt(v, version)}`)
    .join(",")}}`;
}

/**
 * SNBT, either a raw string or a JS value serialized at codegen:
 *
 *   Nbt('{NoAI:1b}')                 -> "{NoAI:1b}"
 *   Nbt({ NoAI: Byte(1) })           -> "{NoAI:1b}"
 *   Nbt({ Pos: [Float(0.5), ...] })  -> "{Pos:[0.5f,...]}"
 */
export class NbtValue implements CommandValue {
  constructor(private readonly value: string | NbtInput) {}
  render(version: VersionProfile): string {
    return typeof this.value === "string"
      ? this.value
      : toSnbt(this.value, version);
  }
}

export type Nbt = NbtValue;
export const Nbt = (value: string | NbtInput): NbtValue => new NbtValue(value);

/**
 * An NBT path (`nbt_path`), rendered verbatim:
 *
 *   NbtPath("Inventory[0].id")  -> "Inventory[0].id"
 */
export class NbtPathValue implements CommandValue {
  constructor(private readonly path: string) {}
  render(): string {
    return this.path;
  }

  /** Indexes into a list: `Path.Entity.Pos.index(1)` -> `Pos[1]`. Returns a new path. */
  index(i: number): NbtPathValue {
    return new NbtPathValue(`${this.path}[${i}]`);
  }

  /** Descend into a compound tag: `Path.Player.abilities.child("mayfly")`. */
  child(key: string): NbtPathValue {
    return new NbtPathValue(`${this.path}.${key}`);
  }

  /** Whether this path is `other` or inside it: `Pos[1]` is within `Pos`. */
  within(other: NbtPathValue): boolean {
    const rest = this.path.slice(other.path.length);
    return this.path.startsWith(other.path) && (rest === "" || /^[.[{]/.test(rest));
  }
}

export type NbtPath = NbtPathValue;
export const NbtPath = (path: string): NbtPathValue => new NbtPathValue(path);
