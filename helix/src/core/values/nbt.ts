import { VersionProfile } from "../../versions/profile";
import { CommandValue } from "./value";

/**
 * A JS value the SNBT serializer understands: primitives, arrays, plain
 * objects, typed-number wrappers (see {@link Float} et al.), or any
 * `CommandValue` (rendered verbatim and inlined - e.g. a {@link BlockValue}).
 */
export type NbtInput =
  | string
  | number
  | boolean
  | NbtNum
  | CommandValue
  | NbtInput[]
  | { [key: string]: NbtInput };

/**
 * A number carrying an explicit SNBT type suffix (`0.0f`, `64b`, `1l`, ...).
 * JS has only one number type, so floats/bytes/longs must be tagged to
 * round-trip correctly. Use the {@link Float}/{@link Double}/… helpers.
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

const BARE_KEY = /^[A-Za-z0-9_.+-]+$/;

/**
 * Control characters with their own short SNBT escape, per vanilla's own
 * `SnbtGrammar.escapeControlCharacters` (26.1.2) - anything else below 0x20
 * falls back to a `\xHH` hex escape there, and the same fallback is used
 * below.
 */
const CONTROL_ESCAPE: Readonly<Record<number, string>> = {
  8: "b", 9: "t", 10: "n", 12: "f", 13: "r",
};

/**
 * A literal control character (a raw `\n` from {@link pageLines}, say)
 * cannot survive unescaped: SNBT source is read one physical line at a time,
 * so an un-escaped newline would split a single command's SNBT across two
 * lines and fail to parse, not just render oddly. Escaping every control
 * character the way vanilla's own SNBT writer does (`StringTag.quoteAndEscape`)
 * keeps the source on one line while decoding back to the real character.
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
 * An embedded value's rendering, quoted if SNBT wouldn't accept it bare.
 *
 * A `CommandValue` renders to *command-line* syntax, where an id is written
 * bare - but SNBT only allows `[A-Za-z0-9_.+-]` unquoted, so an inlined
 * `EntityType.ENDERMAN` would emit `id:minecraft:enderman` and fail to parse on
 * the colon. Compounds and lists (an item stack, a position) are already
 * structure rather than a string, and are left exactly as rendered.
 */
function embed(rendered: string): string {
  if (rendered.startsWith("{") || rendered.startsWith("[")) return rendered;
  return BARE_KEY.test(rendered) ? rendered : quote(rendered);
}

/** Serialize a JS value to SNBT, rendering any embedded `CommandValue`. */
export function toSnbt(value: NbtInput, version: VersionProfile): string {
  if (value instanceof NbtNum) return value.render();
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
 * SNBT (`nbt_tag` / `nbt_compound_tag`). Either raw, rendered verbatim, or a
 * structured JS value serialized at codegen (so embedded version-aware values
 * like blocks render correctly):
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
}

export type NbtPath = NbtPathValue;
export const NbtPath = (path: string): NbtPathValue => new NbtPathValue(path);
