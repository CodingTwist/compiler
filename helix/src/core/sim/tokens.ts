// Splitting a command line into arguments, and reading number ranges.

/** Splits on spaces outside brackets and quotes, so selectors, JSON and SNBT stay whole. */
export function splitArgs(line: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") quote = ch;
    else if ("[{(".includes(ch)) depth++;
    else if ("]})".includes(ch)) depth--;
    else if (ch === " " && depth === 0) {
      if (i > start) out.push(line.slice(start, i));
      start = i + 1;
    }
  }
  if (line.length > start) out.push(line.slice(start));
  return out;
}

/** Splits `a,b={c,d},e` on top-level commas. */
export function splitList(s: string, sep = ","): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if ("[{".includes(s[i])) depth++;
    else if ("]}".includes(s[i])) depth--;
    else if (s[i] === sep && depth === 0) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  if (s.length > start) parts.push(s.slice(start));
  return parts;
}

/** Reads `5`, `..5`, `5..` or `1..5` into an inclusive test. */
export function parseRange(s: string): (v: number) => boolean {
  if (!s.includes("..")) return (v) => v === +s;
  const [lo, hi] = s.split("..");
  return (v) => (lo === "" || v >= +lo) && (hi === "" || v <= +hi);
}
