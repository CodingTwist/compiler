// Moves runs of lines that share leading `execute` clauses into one call.
import type { Datapack } from "../ir/datapack";
import { privateChild } from "../private-fn";
import type { SourceLoc } from "../debug/sources";

/**
 * A leading `execute` clause.
 *
 * `pure` never changes between lines, `self` depends on where the executor is, and
 * `other` depends on which entity a selector picks.
 */
interface Clause {
  text: string;
  kind: "pure" | "self" | "other";
}

/** One line of a function file. */
interface Line {
  text: string;
  source: SourceLoc | undefined;
  /** A comment or blank line, which moves with whatever surrounds it. */
  comment: boolean;
  /** The clauses this line could share with its neighbours. */
  clauses: Clause[];
}

/** Consecutive lines that start with the same clauses. */
interface Run {
  lines: Line[];
  shared: Clause[];
}

/** Commands that move or remove an entity. */
const MOVES =
  /\b(tp|teleport|spreadplayers|ride|rotate|kill)\b|\bdata (modify|merge) entity .*\b(Pos|Rotation)\b|\bstore (result|success) entity .*\b(Pos|Rotation)\b/;

/** Commands that change no entity, so a selector picks the same one before and after. */
const INERT = /^(scoreboard players \S+ [#$]|data get |data modify storage )/;

/** Groups repeated `execute` prefixes in every function file of `dp`. */
export function groupExecutePrefixes(dp: Datapack): void {
  // Allowed functions keep their layout so the allow still matches.
  const allowed = new Set([...dp.allowed.values()].flatMap((fns) => [...fns.keys()]));
  const moves = movesChecker(dp);

  const queue = [...dp.files.keys()];
  // Group files are queued too, so a group can hold a smaller group.
  for (const name of queue) {
    if (allowed.has(name)) continue;
    const text = dp.files.get(name)!;
    const sources = dp.sourceMap.get(name);
    const lines = text.split("\n").map((t, i) => parseLine(t, sources?.[i]));

    let n = 0;
    const call = (part: Run): Line[] => {
      const lead = part.lines.findIndex((l) => !l.comment);
      const body = part.lines.slice(lead);
      const prefix = prefixOf(part.shared);
      let child: string;
      do child = privateChild(name, `group_${n++}`);
      while (dp.files.has(child) || dp.inlined.has(child));

      dp.files.set(child, body.map((l) => (l.comment ? l.text : unprefix(l.text, prefix))).join("\n"));
      if (sources) dp.sourceMap.set(child, body.map((l) => l.source));
      queue.push(child);
      const callLine = parseLine(`${prefix} run function ${dp.name}:${child}`, body[0].source);
      return [...part.lines.slice(0, lead), callLine];
    };

    const out: Line[] = [];
    for (const run of findRuns(lines)) {
      for (const part of splitAtBlockers(run, moves)) {
        out.push(...(worthGrouping(part) ? call(part) : part.lines));
      }
    }

    const next = out.map((l) => l.text).join("\n");
    if (next === text) continue;
    dp.files.set(name, next);
    if (sources) dp.sourceMap.set(name, out.map((l) => l.source));
  }
}

function parseLine(text: string, source: SourceLoc | undefined): Line {
  const comment = text.startsWith("#") || !text.trim();
  // A `return` would exit the group instead of the caller; macro lines aren't known until run.
  const shareable = !comment && !text.startsWith("$") && !/\breturn\b/.test(text);
  return { text, source, comment, clauses: shareable ? clauses(text) : [] };
}

/** Splits `lines` into runs; a line that shares nothing is a run of its own. */
function findRuns(lines: Line[]): Run[] {
  const runs: Run[] = [];
  let run: Run = { lines: [], shared: [] };
  // Comments after the run's last command, which only join if another command does.
  let pending: Line[] = [];

  const close = () => {
    if (run.lines.length) runs.push(run);
    for (const c of pending) runs.push({ lines: [c], shared: [] });
    run = { lines: [], shared: [] };
    pending = [];
  };

  for (const line of lines) {
    if (line.comment) {
      pending.push(line);
      continue;
    }
    const shared = commonPrefix(run.shared, line.clauses);
    if (run.lines.length && shared.length) {
      run.lines.push(...pending, line);
      run.shared = shared;
      pending = [];
    } else {
      close();
      run = { lines: [line], shared: line.clauses };
    }
  }
  close();
  return runs;
}

/** Splits `run` after each line that could change what its shared clauses pick. */
function splitAtBlockers(run: Run, moves: (line: string) => boolean): Run[] {
  const prefix = prefixOf(run.shared);
  const self = run.shared.some((c) => c.kind === "self");
  const other = run.shared.some((c) => c.kind === "other");
  const lastCommand = run.lines.filter((l) => !l.comment).at(-1);

  const parts: Run[] = [];
  let part: Line[] = [];
  for (const line of run.lines) {
    part.push(line);
    // Nothing re-reads the prefix after the last line, so it may do anything.
    if (line.comment || line === lastCommand) continue;
    const blocks = (other && !inert(line.text.slice(prefix.length + 1))) || (self && moves(line.text));
    if (blocks) {
      parts.push({ lines: part, shared: run.shared });
      part = [];
    }
  }
  if (part.length) parts.push({ lines: part, shared: run.shared });
  return parts;
}

/** Whether a call saves work: it costs one command, and a scanning selector costs more. */
function worthGrouping(part: Run): boolean {
  if (!part.shared.length) return false;
  const commands = part.lines.filter((l) => !l.comment).length;
  const scans = part.shared.some((c) => /(^| )@(?!s( |$))/.test(c.text));
  return commands >= (scans ? 2 : 3);
}

/** Returns a checker for whether a line might move or remove an entity, following calls. */
function movesChecker(dp: Datapack): (line: string) => boolean {
  const memo = new Map<string, boolean>();
  const moves = (line: string, seen: Set<string>): boolean => {
    if (line.startsWith("$") || MOVES.test(line)) return true;
    for (const [, ref] of line.matchAll(/\bfunction (\S+)/g)) {
      // A call we can't read might do anything.
      if (!ref.startsWith(`${dp.name}:`)) return true;
      const name = ref.slice(dp.name.length + 1);
      const text = dp.files.get(name);
      if (text === undefined) return true;
      if (seen.has(name)) continue;
      seen.add(name);
      if (!memo.has(name)) {
        memo.set(name, text.split("\n").some((l) => !l.startsWith("#") && moves(l, seen)));
      }
      if (memo.get(name)) return true;
    }
    return false;
  };
  return (line) => moves(line, new Set());
}

/** Whether `rest` (a line after its shared prefix, e.g. `store … run …`) changes no entity. */
function inert(rest: string): boolean {
  const t = tokens(rest);
  let i = 0;
  while (t[i] === "store") {
    if (t[i + 2] === "score" && /^[#$]/.test(t[i + 3] ?? "")) i += 5; // store result score <holder> <objective>
    else if (t[i + 2] === "storage") i += 7; // store result storage <id> <path> <type> <scale>
    else return false;
  }
  return t[i] === "run" && INERT.test(t.slice(i + 1).join(" "));
}

/** The leading `execute` clauses of `line` that a group may share. */
function clauses(line: string): Clause[] {
  if (!line.startsWith("execute ")) return [];
  const t = tokens(line).slice(1);
  const out: Clause[] = [];
  for (let c = nextClause(t); c; c = nextClause(t)) {
    out.push({ text: t.splice(0, c.size).join(" "), kind: c.kind });
  }
  return out;
}

/** Token count and kind of the clause at the start of `t`, or `undefined` if it can't be shared. */
function nextClause([head, a, b]: string[]): { size: number; kind: Clause["kind"] } | undefined {
  const pure = (size: number) => ({ size, kind: "pure" as const });
  const selector = (size: number, sel: string | undefined) => {
    const kind = sel ? selectorKind(sel) : undefined;
    return kind && { size, kind };
  };
  switch (head) {
    case "at":
      return selector(2, a);
    case "as":
      return a === "@s" ? pure(2) : selector(2, a);
    case "positioned":
      if (a === "as") return selector(3, b);
      return a === "over" ? undefined : pure(4);
    case "rotated":
      return a === "as" ? selector(3, b) : pure(3);
    case "facing":
      return a === "entity" ? selector(4, b) : pure(4);
    case "in":
    case "align":
    case "anchored":
      return pure(2);
    case "on":
      // `on passengers` can pick several entities.
      return a === "passengers" ? undefined : { size: 2, kind: "other" };
  }
  return undefined;
}

/** Kind of a selector clause, or `undefined` when it can't be shared safely. */
function selectorKind(sel: string): Clause["kind"] | undefined {
  // Several entities would run the whole group each instead of line by line.
  const single = /^@[spnr](\[|$)/.test(sel) || /[[,]limit=1[,\]]/.test(sel);
  if (!single) return undefined;
  if (sel === "@s") return "self";
  // These args change with scores, NBT or state any line might touch.
  if (/[[,](scores|nbt|predicate)=/.test(sel)) return undefined;
  return "other";
}

/** The longest run of clauses `a` and `b` both start with. */
function commonPrefix(a: Clause[], b: Clause[]): Clause[] {
  let i = 0;
  while (i < a.length && i < b.length && a[i].text === b[i].text) i++;
  return a.slice(0, i);
}

function prefixOf(shared: Clause[]): string {
  return `execute ${shared.map((c) => c.text).join(" ")}`;
}

/** `line` without `prefix`, as a command that runs on its own. */
function unprefix(line: string, prefix: string): string {
  const rest = line.slice(prefix.length + 1);
  return rest.startsWith("run ") ? rest.slice(4) : `execute ${rest}`;
}

/** Splits on spaces outside `[]`, `{}` and quotes, so selectors and NBT stay whole. */
function tokens(line: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = "";
  let cur = "";
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "[" || ch === "{") depth++;
    else if (ch === "]" || ch === "}") depth--;
    else if (ch === " " && depth === 0) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}
