// Parses target selectors out of a rendered line, for the lints.

export interface Sel {
  /** `@e`, `@a`, … */
  kind: string;
  /** Whole selector text, brackets included. */
  text: string;
  start: number;
  end: number;
  /** Top-level `key=value` arguments. */
  args: [string, string][];
}

/** Split on top-level commas, skipping nested `[]{}` and quoted strings. */
export function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = "";
  let from = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) {
      out.push(s.slice(from, i));
      from = i + 1;
    }
  }
  if (from < s.length) out.push(s.slice(from));
  return out;
}

/** Every target selector in a rendered line, with nested nbt/scores args parsed correctly. */
export function selectorsIn(line: string): Sel[] {
  const out: Sel[] = [];
  const re = /@[aeprsn](?!\w)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const start = m.index;
    let end = start + 2;
    if (line[end] === "[") {
      let depth = 0;
      let quote = "";
      for (; end < line.length; end++) {
        const c = line[end];
        if (quote) {
          if (c === "\\") end++;
          else if (c === quote) quote = "";
        } else if (c === '"' || c === "'") quote = c;
        else if (c === "[" || c === "{") depth++;
        else if ((c === "]" || c === "}") && --depth === 0) {
          end++;
          break;
        }
      }
    }
    const text = line.slice(start, end);
    const inner = text.length > 2 ? text.slice(3, -1) : "";
    const args = splitTop(inner).map((a): [string, string] => {
      const eq = a.indexOf("=");
      return [a.slice(0, eq).trim(), a.slice(eq + 1).trim()];
    });
    out.push({ kind: text.slice(0, 2), text, start, end, args });
    re.lastIndex = end;
  }
  return out;
}

export const hasArg = (s: Sel, key: string) => s.args.some(([k]) => k === key);
export const renderSel = (kind: string, args: [string, string][]) =>
  args.length
    ? `${kind}[${args.map(([k, v]) => `${k}=${v}`).join(",")}]`
    : kind;
