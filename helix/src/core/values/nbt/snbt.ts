// Serializes JS values to SNBT, and the `Nbt` value that holds them.
import { VersionProfile } from "../../../versions/profile";
import { CommandValue } from "../value";
import { NbtIntArray, NbtNum } from "./numbers";

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

const BARE_KEY = /^[A-Za-z0-9_.+-]+$/;

/** Control characters with short SNBT escapes, matching vanilla; others use `\xHH`. */
const CONTROL_ESCAPE: Readonly<Record<number, string>> = {
  8: "b",
  9: "t",
  10: "n",
  12: "f",
  13: "r",
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
    return named !== undefined
      ? `\\${named}`
      : `\\x${code.toString(16).padStart(2, "0")}`;
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
 * SNBT, serialized from a JS value at codegen:
 *
 *   Nbt({ NoAI: Byte(1) })           -> "{NoAI:1b}"
 *   Nbt({ Pos: [Float(0.5), ...] })  -> "{Pos:[0.5f,...]}"
 */
export class NbtValue implements CommandValue {
  constructor(private readonly value: NbtInput) {}
  render(version: VersionProfile): string {
    return toSnbt(this.value, version);
  }

  /** The top-level keys of a compound, or `undefined` for raw SNBT or anything else. */
  keys(_version: VersionProfile): string[] | undefined {
    const v = this.value;
    if (
      typeof v !== "object" ||
      v === null ||
      Array.isArray(v) ||
      v instanceof NbtNum ||
      v instanceof NbtIntArray ||
      isCommandValue(v)
    ) {
      return undefined;
    }
    return Object.entries(v).flatMap(([k, x]) => (x === undefined ? [] : [k]));
  }
}

export type Nbt = NbtValue;
export const Nbt = (value: NbtInput): NbtValue => new NbtValue(value);
