// SNBT values and NBT paths for the simulator. Numbers lose their type suffix.

/** An NBT value as plain data: compounds are objects, lists and arrays are arrays. */
export type Tag = number | string | Tag[] | Compound;
export interface Compound {
  [key: string]: Tag;
}

/** Parses SNBT such as `{Pos:[1.0d,2d,3d],Tags:["a"],UUID:[I;1,2,3,4]}`. */
export function parseSnbt(src: string): Tag {
  let i = 0;
  const ws = () => {
    while (/\s/.test(src[i] ?? "")) i++;
  };
  const word = () => {
    ws();
    if (src[i] === '"' || src[i] === "'") {
      const q = src[i++];
      let s = "";
      for (; src[i] !== q; i++) s += src[i] === "\\" ? src[++i] : src[i];
      i++;
      return { text: s, quoted: true };
    }
    const start = i;
    while (i < src.length && /[\w.+-]/.test(src[i])) i++;
    return { text: src.slice(start, i), quoted: false };
  };
  const value = (): Tag => {
    ws();
    if (src[i] === "{") {
      i++;
      const out: Compound = {};
      for (ws(); src[i] !== "}"; ws()) {
        const key = word().text;
        ws();
        i++; // ':'
        out[key] = value();
        ws();
        if (src[i] === ",") i++;
      }
      i++;
      return out;
    }
    if (src[i] === "[") {
      i++;
      if (/^[BIL];/.test(src.slice(i, i + 2))) i += 2;
      const out: Tag[] = [];
      for (ws(); src[i] !== "]"; ws()) {
        out.push(value());
        ws();
        if (src[i] === ",") i++;
      }
      i++;
      return out;
    }
    const { text, quoted } = word();
    if (quoted) return text;
    if (text === "true") return 1;
    if (text === "false") return 0;
    const num = text.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)[bslfd]?$/i);
    return num ? +num[1] : text;
  };
  return value();
}

type Segment = string | number;

/** Splits `frame.Pos[0]` into `["frame", "Pos", 0]`. A `{}` match reads as the root. */
export function parsePath(path: string): Segment[] {
  if (path === "{}") return [];
  const out: Segment[] = [];
  for (const m of path.matchAll(/"([^"]*)"|\[(-?\d+)\]|([^.[\]"]+)/g)) {
    out.push(m[2] !== undefined ? +m[2] : (m[1] ?? m[3]));
  }
  return out;
}

/** Reads the tag at `path`, or undefined when any step is missing. */
export function getPath(root: Compound, path: string): Tag | undefined {
  let cur: Tag | undefined = root;
  for (const seg of parsePath(path)) {
    if (cur === undefined || typeof cur !== "object") return undefined;
    cur = typeof seg === "number" && Array.isArray(cur) ? cur.at(seg) : (cur as Compound)[seg];
  }
  return cur;
}

/** Writes `value` at `path`, creating compounds on the way. The root is replaced by merging. */
export function setPath(root: Compound, path: string, value: Tag): void {
  const segs = parsePath(path);
  if (segs.length === 0) return mergeInto(root, value as Compound);
  let cur = root as Compound | Tag[];
  for (const seg of segs.slice(0, -1)) {
    const next = (cur as Compound)[seg as string];
    cur = (next ?? ((cur as Compound)[seg as string] = {})) as Compound;
  }
  const last = segs.at(-1)!;
  if (typeof last === "number" && Array.isArray(cur)) cur[last < 0 ? cur.length + last : last] = value;
  else (cur as Compound)[last] = value;
}

/** Deep-merges compounds the way `data merge` does: lists and numbers are replaced whole. */
export function mergeInto(target: Compound, source: Compound): void {
  for (const [k, v] of Object.entries(source)) {
    const cur = target[k];
    if (isCompound(v) && isCompound(cur)) mergeInto(cur, v);
    else target[k] = structuredClone(v);
  }
}

const isCompound = (t: Tag | undefined): t is Compound =>
  typeof t === "object" && !Array.isArray(t);
