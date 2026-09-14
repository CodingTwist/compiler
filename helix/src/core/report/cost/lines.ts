// Reads rendered function text: command lines, call sites, clock gates and bare `@e` scans.

/** A helix clock gate (`timing.phaseGate`): an exact residue, not the `N..` wrap. */
export const CLOCK_GATE = /if score t(\d+) clock matches \d+(?![.\d])/g;

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const lcm = (a: number, b: number) => (a * b) / gcd(a, b);

/** A selector narrowed by any of these is treated as bounded (a small scan). */
const BOUNDED_PREDICATES = ["limit=", "type=", "tag=", "name="];

/** Unbounded `@e` selectors in a line: no `type`, `limit`, `tag` or `name`. */
export function unboundedScansIn(line: string): string[] {
  const out: string[] = [];
  // `@e` optionally followed by a `[...]` predicate block.
  const re = /@e(\[[^\]]*\])?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const predicates = m[1] ?? "";
    if (!BOUNDED_PREDICATES.some((p) => predicates.includes(p))) {
      out.push(m[0]);
    }
  }
  return out;
}

/** Bare command/call lines of a function (blank lines and `#` comments dropped). */
export function commandLines(text: string): string[] {
  return indexedCommandLines(text).map(([l]) => l);
}

/** Command lines paired with their line index in the file - the index `dp.sourceMap` uses. */
export function indexedCommandLines(text: string): [string, number][] {
  return text
    .split("\n")
    .map((l, i): [string, number] => [l.trim(), i])
    .filter(([l]) => l.length > 0 && !l.startsWith("#"));
}

/**
 * Direct call sites in body order, each with the `execute` guard before it (`""` if none).
 */
export function directCallSites(
  text: string,
  dpName: string,
): { callee: string; guard: string }[] {
  const out: { callee: string; guard: string }[] = [];
  const callRe = new RegExp(`function ${dpName}:([\\w/.\\-]+)`);
  for (const line of commandLines(text)) {
    const m = callRe.exec(line);
    if (!m) continue;
    const guard = line
      .slice(0, m.index)
      .replace(/^execute\s+/, "")
      .replace(/\s*run\s*$/, "")
      .trim();
    out.push({ callee: m[1], guard });
  }
  return out;
}

/** A gate on the line itself (`execute if score t20 … run data get …`) slows it further. */
export const linePeriod = (line: string, p: number) =>
  [...line.matchAll(CLOCK_GATE)].reduce((acc, m) => lcm(acc, Number(m[1])), p);
