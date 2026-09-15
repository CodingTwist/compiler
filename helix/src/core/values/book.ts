import { TellrawPart } from "../frontend/nodes/tellraw_part";
import { Text, text } from "../frontend/nodes/text";

/**
 * Character widths in the default font's pixels, for printable ASCII.
 * Measured from the client's font texture the same way the client does.
 */
const CHAR_WIDTH: Readonly<Record<string, number>> = {
  " ": 4,
  "!": 2,
  '"': 4,
  "#": 6,
  $: 6,
  "%": 6,
  "&": 6,
  "'": 2,
  "(": 4,
  ")": 4,
  "*": 4,
  "+": 6,
  ",": 2,
  "-": 6,
  ".": 2,
  "/": 6,
  "0": 6,
  "1": 6,
  "2": 6,
  "3": 6,
  "4": 6,
  "5": 6,
  "6": 6,
  "7": 6,
  "8": 6,
  "9": 6,
  ":": 2,
  ";": 2,
  "<": 5,
  "=": 6,
  ">": 5,
  "?": 6,
  "@": 7,
  A: 6,
  B: 6,
  C: 6,
  D: 6,
  E: 6,
  F: 6,
  G: 6,
  H: 6,
  I: 4,
  J: 6,
  K: 6,
  L: 6,
  M: 6,
  N: 6,
  O: 6,
  P: 6,
  Q: 6,
  R: 6,
  S: 6,
  T: 6,
  U: 6,
  V: 6,
  W: 6,
  X: 6,
  Y: 6,
  Z: 6,
  "[": 4,
  "\\": 6,
  "]": 4,
  "^": 6,
  _: 6,
  "`": 3,
  a: 6,
  b: 6,
  c: 6,
  d: 6,
  e: 6,
  f: 5,
  g: 6,
  h: 6,
  i: 2,
  j: 6,
  k: 5,
  l: 3,
  m: 6,
  n: 6,
  o: 6,
  p: 6,
  q: 6,
  r: 6,
  s: 6,
  t: 4,
  u: 6,
  v: 6,
  w: 6,
  x: 6,
  y: 6,
  z: 6,
  "{": 4,
  "|": 2,
  "}": 4,
  "~": 7,
};

/** A string's rendered width in pixels; bold adds 1px per character. */
export function textWidth(s: string, bold: boolean): number {
  let width = 0;
  for (const ch of s) {
    const w = CHAR_WIDTH[ch];
    if (w === undefined) {
      throw new Error(
        `No measured width for ${JSON.stringify(ch)} - extend CHAR_WIDTH before aligning text containing it.`,
      );
    }
    width += w + (bold ? 1 : 0);
  }
  return width;
}

/**
 * A written book page's content width in pixels (the client's `BookViewScreen.TEXT_WIDTH`).
 */
export const BOOK_PAGE_WIDTH = 114;

/** One default-font space's advance - the unit {@link rightAlign} pads with. */
const SPACE_WIDTH = 4;

function partWidth(part: TellrawPart): number {
  if (!(part instanceof Text)) {
    throw new Error(
      "Only plain text(...) spans can be measured for alignment, not selectors, scores or NBT refs.",
    );
  }
  return textWidth(part.text, part.style.bold === true);
}

/**
 * One line with `left` at the margin and `right` at the far edge, padded using real
 * character widths.
 */
export function rightAlign(
  left: string | TellrawPart,
  right: string | TellrawPart,
): TellrawPart[] {
  const l = typeof left === "string" ? text(left) : left;
  const r = typeof right === "string" ? text(right) : right;
  const gap = BOOK_PAGE_WIDTH - partWidth(l) - partWidth(r);
  if (gap < 0) {
    throw new Error(
      `rightAlign: left and right together are ${-gap}px wider than a page.`,
    );
  }
  return [l, text(" ".repeat(Math.floor(gap / SPACE_WIDTH))), r];
}

/** Joins a page's lines. A blank line is `""`; each line can have its own styled spans. */
export function pageLines(
  ...lines: (string | TellrawPart | TellrawPart[])[]
): TellrawPart[] {
  const runs: TellrawPart[] = [];
  lines.forEach((line, i) => {
    if (i > 0) runs.push(text("\n"));
    if (Array.isArray(line)) runs.push(...line);
    else runs.push(typeof line === "string" ? text(line) : line);
  });
  return runs;
}
