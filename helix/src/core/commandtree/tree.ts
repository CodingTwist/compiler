import { parserToType } from "./parsers";

// A node in Minecraft's generated commands.json (the Brigadier command tree).
// Only the fields we use are typed.
export interface BrigadierNode {
  type: "root" | "literal" | "argument";
  children?: Record<string, BrigadierNode>;
  parser?: string;
  executable?: boolean;
  redirect?: string[];
}

// One step along a command's spine. `tsType` is only meaningful to the code
// generator; the runtime interpreter cares about name / kind / values.
export type Segment =
  | { kind: "literal"; text: string }
  | { kind: "arg"; name: string; tsType: string; optional: boolean }
  | { kind: "enum"; name: string; values: string[]; optional: boolean };

const RESERVED = new Set([
  "function", "default", "new", "in", "of", "return", "case", "switch", "var",
  "let", "const", "class", "this", "void", "null", "true", "false", "do", "if",
  "else", "for", "while", "enum", "export", "import", "with",
]);

export function safeName(raw: string): string {
  let name = raw.replace(/[^a-zA-Z0-9_$]/g, "_");
  if (/^[0-9]/.test(name)) name = "_" + name;
  if (RESERVED.has(name)) name = name + "_";
  return name;
}

export function countArgs(node: BrigadierNode): number {
  let n = node.type === "argument" ? 1 : 0;
  for (const child of Object.values(node.children ?? {})) n += countArgs(child);
  return n;
}

export function hasRedirect(node: BrigadierNode): boolean {
  if (node.redirect) return true;
  return Object.values(node.children ?? {}).some(hasRedirect);
}

// Follow a command's tree into a single linear parameter list. Once a node is
// `executable`, everything after it is optional (the command can stop there).
// Trailing alternative literal leaves collapse into one optional enum param;
// genuine structural branches follow the richest path and leave a NOTE.
//
// SHARED by the generator (to emit typed factories) and the runtime interpreter
// (to render a version's tree) so the two never disagree on arg names.
export function buildSpine(commandNode: BrigadierNode): {
  segments: Segment[];
  notes: string[];
} {
  const segments: Segment[] = [];
  const notes: string[] = [];
  let node = commandNode;
  let optional = false;
  let enumCount = 0;

  while (node.children && Object.keys(node.children).length > 0) {
    const entries = Object.entries(node.children);

    const allLiteralLeaves = entries.every(
      ([, c]) =>
        c.type === "literal" && Object.keys(c.children ?? {}).length === 0,
    );
    if (entries.length > 1 && allLiteralLeaves) {
      enumCount++;
      segments.push({
        kind: "enum",
        name: enumCount === 1 ? "mode" : `mode${enumCount}`,
        values: entries.map(([n]) => n).sort(),
        optional: optional || !!node.executable,
      });
      break;
    }

    let chosenName: string;
    let chosen: BrigadierNode;
    if (entries.length === 1) {
      [chosenName, chosen] = entries[0];
    } else {
      const sorted = [...entries].sort(
        (a, b) => countArgs(b[1]) - countArgs(a[1]),
      );
      [chosenName, chosen] = sorted[0];
      notes.push(
        `multiple sub-syntaxes; generated the richest path. Other branches: ${sorted
          .slice(1)
          .map(([n]) => n)
          .join(", ")}`,
      );
    }

    if (node.executable) optional = true;

    if (chosen.type === "argument") {
      segments.push({
        kind: "arg",
        name: safeName(chosenName),
        tsType: parserToType(chosen.parser),
        optional,
      });
    } else {
      segments.push({ kind: "literal", text: chosenName });
      if (optional) {
        notes.push(`review optional fixed token '${chosenName}'`);
      }
    }
    node = chosen;
  }

  return { segments, notes };
}
