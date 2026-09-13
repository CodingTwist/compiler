// Compile-time per-tick cost report. A datapack compiler is uniquely able to walk
// the *static* call graph rooted at the `tick` tag and tell the author, before the
// pack ever loads, how much work runs each tick and where the expensive unbounded
// entity scans live (the #1 source of datapack lag).
//
// The analysis runs over the already-rendered function text in `dp.files` (the same
// output codegen writes to disk): call edges are the emitted `function <ns>:<name>`
// lines, a "command" is any non-blank, non-comment line, and selectors appear in
// their final version-rendered form. This is read-only inspection of output, not
// command authoring, so it is deliberately string-based - it sees exactly what the
// game will run, including inlined `execute … run` branches.
import type { Datapack } from "../ir/datapack";
import type { SourceLoc } from "../debug/sources";

/** Per-function cost: its own command count and any unbounded `@e` scans it makes. */
export interface FunctionCost {
  name: string;
  /** Non-blank, non-comment command lines in this function (calls included). */
  commands: number;
  /** Rendered selectors in this function that scan all entities (e.g. bare `@e`). */
  unboundedScans: string[];
  /** The author line behind each of {@link unboundedScans}, with `debug.sources` on. */
  scanSources: (SourceLoc | undefined)[];
}

/**
 * Cost attributed to one direct call site in a tick root's body - the subtree
 * reached *through that call*, with each shared function counted once (claimed by
 * the first call site in body order that reaches it). So a root's `selfCommands`
 * plus every breakdown entry's `commands` sums back to its `worstCaseCommands`.
 */
export interface CallSiteCost {
  /** The called function (bare name). */
  callee: string;
  /** The `execute …` guard this call sits behind, or `""` when unconditional. */
  guard: string;
  /** Attributed commands: this callee's subtree, shared functions counted once. */
  commands: number;
  /** Attributed functions in that subtree. */
  functions: number;
}

/** Worst-case reachable cost for one `tick`-tagged root function. */
export interface TickRootCost {
  root: string;
  /** Distinct functions reachable from this root (the root included). */
  reachableFunctions: number;
  /** Sum of every reachable function's own command count. */
  worstCaseCommands: number;
  /** The root function's own command lines (the dispatch/guard lines themselves). */
  selfCommands: number;
  /** Per-direct-call-site cost, sorted heaviest first. Partitions the subtree. */
  breakdown: CallSiteCost[];
  /** True if a call cycle (recursion) was reached - worst case is then a lower bound. */
  recursive: boolean;
}

export interface CostReport {
  tickRoots: TickRootCost[];
  /** Sum of worst-case commands across all tick roots. */
  totalWorstCaseCommandsPerTick: number;
  /** Functions reachable from `tick` that perform an unbounded entity scan. */
  unboundedScanners: FunctionCost[];
  /** Every analysed function by bare name. */
  perFunction: Map<string, FunctionCost>;
  /** Entity/block NBT reads reachable from `tick`, with how often they run. */
  nbtReads: NbtRead[];
  /** The {@link nbtReads} faster than {@link NBT_READ_MIN_PERIOD} that nobody allowed. */
  warnings: NbtRead[];
  /** Wiki optimisation lints nobody allowed - see {@link LintRule}. */
  lints: Lint[];
  /** Lints silenced with `dp.allow`, reason attached. */
  allowedLints: Lint[];
  /** `dp.allow` calls naming a function the pack doesn't have (renamed or moved) - they silence nothing. */
  staleAllows: { rule: LintRule; fn: string }[];
}

/** One NBT read in a tick-reachable function. */
export interface NbtRead {
  fn: string;
  /** Fastest cadence the function is reached at, in ticks (1 = every tick). */
  period: number;
  line: string;
  /** Why it's fine, when allowed via `dp.allowNbtRead`. */
  allowed?: string;
  /** A cheaper check for what this read is after, when the line says. */
  hint?: string;
  /** The author line that emitted it, with `debug.sources` on. */
  source?: SourceLoc;
  /** Every path to it passes an `if`/`unless`, so `period` is a ceiling, not a rate. */
  guarded?: boolean;
  /** Identical reads in the same function collapsed into this one. */
  count?: number;
}

/** Reads at this period or slower (the t5 clock) aren't warned about. */
export const NBT_READ_MIN_PERIOD = 5;

/**
 * Entity/block NBT reads: each one serializes the whole entity (or block entity).
 * `storage` is a plain compound lookup, so it isn't counted.
 */
const NBT_READ = /nbt=|data get (entity|block)|(if|unless) data (entity|block)|from (entity|block)/;

/** A helix clock gate (`timing.phaseGate`): an exact residue, not the `N..` wrap. */
const CLOCK_GATE = /if score t(\d+) clock matches \d+(?![.\d])/g;

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const lcm = (a: number, b: number) => (a * b) / gcd(a, b);

/** A selector narrowed by any of these is treated as bounded (a small scan). */
const BOUNDED_PREDICATES = ["limit=", "type=", "tag=", "name="];

/**
 * Find unbounded `@e` selectors in a single rendered line. `@e` with no `type`,
 * `limit`, `tag` or `name` predicate iterates every loaded entity; `@a/@p/@r/@s`
 * are bounded by the player set and are not flagged.
 */
function unboundedScansIn(line: string): string[] {
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
function commandLines(text: string): string[] {
  return indexedCommandLines(text).map(([l]) => l);
}

/** Command lines paired with their line index in the file - the index `dp.sourceMap` uses. */
function indexedCommandLines(text: string): [string, number][] {
  return text
    .split("\n")
    .map((l, i): [string, number] => [l.trim(), i])
    .filter(([l]) => l.length > 0 && !l.startsWith("#"));
}

/**
 * Build the per-function cost map plus the call graph (caller → called function
 * names) from rendered function text. Call edges are the emitted
 * `function <ns>:<name>` tokens - they appear bare or inside an `execute … run`.
 */
function analyseFunctions(dp: Datapack): {
  costs: Map<string, FunctionCost>;
  calls: Map<string, string[]>;
} {
  const costs = new Map<string, FunctionCost>();
  const calls = new Map<string, string[]>();
  const callRe = new RegExp(`function ${dp.name}:([\\w/.\\-]+)`, "g");

  for (const [name, text] of dp.files) {
    const lines = indexedCommandLines(text);
    const unboundedScans: string[] = [];
    const scanSources: (SourceLoc | undefined)[] = [];
    const callees: string[] = [];
    for (const [line, i] of lines) {
      for (const scan of unboundedScansIn(line)) {
        unboundedScans.push(scan);
        scanSources.push(dp.sourceMap.get(name)?.[i]);
      }
      let m: RegExpExecArray | null;
      callRe.lastIndex = 0;
      while ((m = callRe.exec(line)) !== null) callees.push(m[1]);
    }
    costs.set(name, { name, commands: lines.length, unboundedScans, scanSources });
    calls.set(name, callees);
  }
  return { costs, calls };
}

/**
 * Direct `function <ns>:<name>` call sites in a function's body, in body order,
 * each paired with the `execute …` guard it sits behind (`""` when unconditional).
 * One entry per line; the guard is the line text before the call with the leading
 * `execute` and trailing `run` stripped.
 */
function directCallSites(
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

/**
 * Walk the subtree rooted at `start`, counting each not-yet-`claimed` function
 * once (and marking it claimed). Returns the newly-attributed command/function
 * totals, so successive calls over one root's call sites partition its subtree.
 */
function attributeSubtree(
  start: string,
  calls: Map<string, string[]>,
  costs: Map<string, FunctionCost>,
  claimed: Set<string>,
): { commands: number; functions: number } {
  let commands = 0;
  let functions = 0;
  const stack = [start];
  while (stack.length > 0) {
    const name = stack.pop()!;
    if (claimed.has(name)) continue;
    claimed.add(name);
    commands += costs.get(name)?.commands ?? 0;
    functions += 1;
    for (const callee of calls.get(name) ?? []) stack.push(callee);
  }
  return { commands, functions };
}

/**
 * Static per-tick cost analysis. Requires `dp.files` to be populated; callers go
 * through {@link Datapack.report}, which runs codegen first.
 */
export function analyzeCost(dp: Datapack): CostReport {
  const { costs, calls } = analyseFunctions(dp);
  const tickRoots = [...(dp.tags.get("tick") ?? [])];

  const reachableFromTick = new Set<string>();
  const rootCosts: TickRootCost[] = [];

  for (const root of tickRoots) {
    const reached = new Set<string>();
    let recursive = false;
    const stack = [root];
    while (stack.length > 0) {
      const name = stack.pop()!;
      if (reached.has(name)) {
        recursive = true; // re-entered an already-seen function on this root
        continue;
      }
      reached.add(name);
      for (const callee of calls.get(name) ?? []) stack.push(callee);
    }
    let worstCaseCommands = 0;
    for (const name of reached) {
      reachableFromTick.add(name);
      worstCaseCommands += costs.get(name)?.commands ?? 0;
    }

    // Partition the subtree across the root's direct call sites (body order, so a
    // shared function is attributed to whichever call site reaches it first). The
    // root's own lines stay as `selfCommands`; the rest sums across the breakdown.
    const selfCommands = costs.get(root)?.commands ?? 0;
    const claimed = new Set<string>([root]);
    const seen = new Set<string>();
    const breakdown: CallSiteCost[] = [];
    for (const { callee, guard } of directCallSites(dp.files.get(root) ?? "", dp.name)) {
      if (seen.has(callee)) continue; // one row per callee; first guard wins
      seen.add(callee);
      const { commands, functions } = attributeSubtree(callee, calls, costs, claimed);
      breakdown.push({ callee, guard, commands, functions });
    }
    breakdown.sort((a, b) => b.commands - a.commands);

    rootCosts.push({
      root,
      reachableFunctions: reached.size,
      worstCaseCommands,
      selfCommands,
      breakdown,
      recursive,
    });
  }

  const { period, allowedBy } = cadence(dp, tickRoots, dp.allowed.get("nbt-read"));
  const guarded = guardedFns(dp, tickRoots, period);
  const nbtReads: NbtRead[] = [];
  for (const [fn, p] of [...period].sort(([a], [b]) => a.localeCompare(b))) {
    for (const [line, i] of indexedCommandLines(dp.files.get(fn) ?? "")) {
      if (!NBT_READ.test(line)) continue;
      const source = dp.sourceMap.get(fn)?.[i];
      const hint = nbtReadHint(line);
      nbtReads.push({
        fn,
        period: linePeriod(line, p),
        line,
        allowed: allowedBy.get(fn),
        ...(guarded.has(fn) && { guarded: true }),
        ...(hint && { hint }),
        ...(source && { source }),
      });
    }
  }

  const { lints, allowedLints } = lint(dp, tickRoots, period, guarded, costs);

  const unboundedScanners: FunctionCost[] = [];
  for (const name of reachableFromTick) {
    const cost = costs.get(name);
    if (cost && cost.unboundedScans.length > 0) unboundedScanners.push(cost);
  }
  unboundedScanners.sort((a, b) => a.name.localeCompare(b.name));

  return {
    tickRoots: rootCosts,
    totalWorstCaseCommandsPerTick: rootCosts.reduce(
      (sum, r) => sum + r.worstCaseCommands,
      0,
    ),
    unboundedScanners,
    perFunction: costs,
    nbtReads,
    warnings: collapseReads(nbtReads.filter((r) => r.period < NBT_READ_MIN_PERIOD && !r.allowed)),
    lints,
    allowedLints,
    staleAllows: [...dp.allowed].flatMap(([rule, fns]) =>
      [...fns.keys()].filter((fn) => !dp.files.has(fn)).map((fn) => ({ rule, fn })),
    ),
  };
}

/** A gate on the line itself (`execute if score t20 … run data get …`) slows it further. */
const linePeriod = (line: string, p: number) =>
  [...line.matchAll(CLOCK_GATE)].reduce((acc, m) => lcm(acc, Number(m[1])), p);

/**
 * Cadence: walk from the roots carrying a period, raised by every clock gate a
 * call sits behind. A function keeps the fastest period it is reached at.
 * An allow covers everything the allowed function calls (its `execute … run`
 * bodies included), unless that callee is also reached some other, faster way.
 */
function cadence(dp: Datapack, roots: string[], allows: Map<string, string> | undefined) {
  const period = new Map<string, number>();
  const allowedBy = new Map<string, string | undefined>();
  const work: [string, number, string | undefined][] = roots.map((r) => [r, 1, undefined]);
  while (work.length > 0) {
    const [name, p, inherited] = work.pop()!;
    const allowed = allows?.get(name) ?? inherited;
    const seen = period.get(name);
    // Revisit only for a faster period, or the same one without an allow.
    if (seen !== undefined && (seen < p || (seen === p && (!allowedBy.get(name) || allowed)))) continue;
    period.set(name, p);
    allowedBy.set(name, allowed);
    for (const { callee, guard } of directCallSites(dp.files.get(name) ?? "", dp.name)) {
      work.push([callee, linePeriod(guard, p), allowed]);
    }
  }
  return { period, allowedBy };
}

/**
 * Tick-reachable functions only ever called behind an `if`/`unless` (clock gates aside,
 * they already set the period): they run *at most* that often - an edge-triggered
 * `leave` looks per-tick statically, so the report says "up to".
 */
function guardedFns(dp: Datapack, roots: string[], period: Map<string, number>): Set<string> {
  const free = new Set<string>();
  const stack = [...roots];
  while (stack.length > 0) {
    const name = stack.pop()!;
    if (free.has(name)) continue;
    free.add(name);
    for (const { callee, guard } of directCallSites(dp.files.get(name) ?? "", dp.name)) {
      if (!/\b(if|unless)\b/.test(guard.replace(CLOCK_GATE, ""))) stack.push(callee);
    }
  }
  return new Set([...period.keys()].filter((fn) => !free.has(fn)));
}

/** Identical reads in one function (the same line twice) → one entry with a count. */
function collapseReads(reads: NbtRead[]): NbtRead[] {
  const out = new Map<string, NbtRead>();
  for (const r of reads) {
    const seen = out.get(`${r.fn}|${r.line}`);
    if (seen) seen.count = (seen.count ?? 1) + 1;
    else out.set(`${r.fn}|${r.line}`, { ...r });
  }
  return [...out.values()];
}

// ---------------------------------------------------------------------------
// Lints: the Minecraft Wiki's "Optimizing a data pack" advice, checked against
// rendered lines. Rules marked exact flag a line with an equivalent cheaper
// form and run over every function; the rest only look at tick-reachable code.
// Anything intentional is silenced per function with `dp.allow(rule, fn, why)`.
// ---------------------------------------------------------------------------

export type LintRule =
  | "nbt-read"
  | "nbt-write"
  | "vacuous-execute"
  | "fold-into-selector"
  | "redundant-as"
  | "missing-type"
  | "repeated-selector"
  | "macro-score-set"
  | "poll-trigger";

export interface Lint {
  rule: LintRule;
  fn: string;
  line: string;
  hint: string;
  /** Fastest cadence in ticks, when the function is reachable from `tick`. */
  period?: number;
  /** Only reached behind an `if`/`unless`: `period` is a ceiling. */
  guarded?: boolean;
  /** Why it's fine, for a lint silenced by `dp.allow`. */
  allowed?: string;
  /** Lines in the function with the same finding, when more than one (`line` is the first). */
  count?: number;
  source?: SourceLoc;
}

interface Sel {
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
function splitTop(s: string): string[] {
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

const hasArg = (s: Sel, key: string) => s.args.some(([k]) => k === key);
const renderSel = (kind: string, args: [string, string][]) =>
  args.length ? `${kind}[${args.map(([k, v]) => `${k}=${v}`).join(",")}]` : kind;

/** Item-holding NBT: `if items` reads the slot without serialising the entity. */
const ITEM_NBT = /\b(SelectedItem|Inventory|EnderItems|equipment|HandItems|ArmorItems|Items?)\b/;

function nbtReadHint(line: string): string | undefined {
  if (ITEM_NBT.test(line)) {
    return "item checks don't need NBT: `execute if items entity|block <target> <slot> <item>`";
  }
  if (/nbt=|(data get|if data|unless data|from) entity/.test(line)) {
    return "if an entity predicate (flags, equipment, vehicle, location, effects…) or a selector argument covers this field, check that instead";
  }
  return undefined;
}

/** Commands whose target takes many entities, so `execute as <sel> run <cmd @s>` ≡ `<cmd sel>`. */
const MULTI_TARGET = [
  /^effect (give|clear) @s\b/,
  /^tag @s (add|remove) /,
  /^kill @s$/,
  /^give @s /,
  /^clear @s\b/,
  /^scoreboard players (set|add|remove|reset|enable) @s\b/,
  /^tellraw @s /,
  /^title @s /,
  /^gamemode \S+ @s$/,
  /^advancement (grant|revoke) @s /,
  /^(xp|experience) (add|set) @s /,
  /^team join \S+ @s$/,
];

/** Stat criteria with an advancement trigger that fires on the same event. */
const STAT_TRIGGERS: [RegExp, string][] = [
  [/^(minecraft\.)?killed:/, "player_killed_entity (Trigger.playerKilledEntity)"],
  [/^(minecraft\.)?custom:(minecraft\.)?damage_dealt$/, "player_hurt_entity (Trigger.playerHurtEntity)"],
  [/^(minecraft\.)?custom:(minecraft\.)?damage_taken$/, 'entity_hurt_player (Trigger.of("minecraft:entity_hurt_player"))'],
  [/^(minecraft\.)?crafted:/, 'recipe_crafted (Trigger.of("minecraft:recipe_crafted"))'],
  [/^(minecraft\.)?picked_up:/, "inventory_changed (Trigger.inventoryChanged)"],
  [/^(minecraft\.)?custom:(minecraft\.)?enchant_item$/, 'enchanted_item (Trigger.of("minecraft:enchanted_item"))'],
  [/^(minecraft\.)?custom:(minecraft\.)?traded_with_villager$/, 'villager_trade (Trigger.of("minecraft:villager_trade"))'],
  [/^(minecraft\.)?custom:(minecraft\.)?fish_caught$/, 'fishing_rod_hooked (Trigger.of("minecraft:fishing_rod_hooked"))'],
  // `used:` has no one trigger, and the stick items have none at all.
  [
    /^(minecraft\.)?used:(?!(minecraft\.)?(carrot|warped_fungus)_on_a_stick$)/,
    "consume_item (food/potions), placed_block (blocks), using_item (bows, shields…) or item_used_on_block, depending on the item",
  ],
];

/** Entity NBT writes a vanilla command performs directly. Other fields have no alternative, so aren't flagged. */
const NBT_WRITE_COMMANDS: [RegExp, string][] = [
  [/^(Item|item|Inventory|equipment|HandItems|ArmorItems)\b/, "`item replace|modify entity <target> <slot>` (dp.itemModifier)"],
  [/^Rotation\b/, "`rotate` (1.21.2+) or `tp`"],
  [/^Pos\b/, "`tp`"],
  [/^Tags\b/, "`tag`"],
  [/^(active_effects|ActiveEffects)\b/, "`effect`"],
  [/^(attributes|Attributes)\b/, "`attribute`"],
];

const LOCATION_HINT =
  "players entering a fixed area: Trigger.location - matches a box (not a radius), checked about once a second, and the reward must revoke the advancement to re-arm";

/** Position-dependent selector arguments: the same text scans a different set elsewhere. */
const POSITIONAL = new Set(["distance", "x", "y", "z", "dx", "dy", "dz"]);

function lint(
  dp: Datapack,
  roots: string[],
  period: Map<string, number>,
  guarded: Set<string>,
  costs: Map<string, FunctionCost>,
): { lints: Lint[]; allowedLints: Lint[] } {
  // Per rule: which functions an allow covers (inheriting down the tick tree),
  // plus direct allows on functions outside it. Walked only for rules with allows.
  const allowWalks = new Map<LintRule, Map<string, string | undefined>>();
  const allowedFor = (rule: LintRule, fn: string): string | undefined => {
    const allows = dp.allowed.get(rule);
    if (!allows?.size) return undefined;
    if (!allowWalks.has(rule)) allowWalks.set(rule, cadence(dp, roots, allows).allowedBy);
    return allowWalks.get(rule)!.get(fn) ?? allows.get(fn);
  };

  // Objective → stat criterion, off the rendered `scoreboard objectives add` lines.
  const criteria = new Map<string, string>();
  for (const text of dp.files.values()) {
    for (const m of text.matchAll(/^scoreboard objectives add (\S+) (\S+)/gm)) criteria.set(m[1], m[2]);
  }

  // Functions running as each player: called behind `as @a…`, and down from there
  // through calls that don't re-bind the executor.
  const perPlayer = new Set<string>();
  const stack: [string, boolean][] = roots.map((r) => [r, false]);
  const visited = new Set<string>();
  while (stack.length > 0) {
    const [name, asPlayer] = stack.pop()!;
    const key = `${name}|${asPlayer}`;
    if (visited.has(key)) continue;
    visited.add(key);
    if (asPlayer) perPlayer.add(name);
    for (const { callee, guard } of directCallSites(dp.files.get(name) ?? "", dp.name)) {
      const rebinds = [...guard.matchAll(/\bas (@\w)/g)].map((m) => m[1]).filter((k) => k !== "@s");
      stack.push([callee, rebinds.length ? rebinds[rebinds.length - 1] === "@a" : asPlayer]);
    }
  }

  const lints: Lint[] = [];
  const allowedLints: Lint[] = [];
  for (const [fn, text] of [...dp.files].sort(([a], [b]) => a.localeCompare(b))) {
    const p = period.get(fn);
    const tick = p !== undefined;
    const add = (rule: LintRule, line: string, i: number, hint: string) => {
      const source = dp.sourceMap.get(fn)?.[i];
      const allowed = allowedFor(rule, fn);
      const l: Lint = {
        rule,
        fn,
        line,
        hint,
        ...(tick && { period: linePeriod(line, p) }),
        ...(guarded.has(fn) && { guarded: true }),
        ...(allowed && { allowed }),
        ...(source && { source }),
      };
      (allowed ? allowedLints : lints).push(l);
    };
    const unbounded = new Set(costs.get(fn)?.unboundedScans ?? []);
    const scans = new Map<string, { sel: string; line: string; lines: Set<number> }>();

    for (const [line, i] of indexedCommandLines(text)) {
      const sels = selectorsIn(line);

      // --- exact rewrites, every function ---
      if (/^\$?execute run /.test(line)) {
        add("vacuous-execute", line, i, "`execute run <cmd>` with no subcommands is just `<cmd>`");
      }

      for (const s of sels) {
        if (!/(^|\s)as $/.test(line.slice(0, s.start))) continue;
        // `limit`/`sort` pick before the check, so folding would change who matches.
        if (hasArg(s, "limit") || hasArg(s, "sort") || /@[prn]/.test(s.kind)) continue;
        const rest = line.slice(s.end);
        const score = /^ if score @s (\S+) matches (\S+)/.exec(rest);
        if (score) {
          if (hasArg(s, "scores")) continue; // merging into an existing scores={} is left to the author
          add("fold-into-selector", line, i, `\`${renderSel(s.kind, [...s.args, ["scores", `{${score[1]}=${score[2]}}`]])}\` instead of \`as ${s.text}${score[0]}\``);
          continue;
        }
        const ent = /^ if entity (@s\[)/.exec(rest);
        if (ent) {
          const self = selectorsIn(rest.slice(" if entity ".length))[0];
          const repeatable = new Set(["tag", "nbt", "predicate"]);
          if (self.args.some(([k, v]) => !repeatable.has(k) && !v.startsWith("!") && hasArg(s, k))) continue;
          add("fold-into-selector", line, i, `\`as ${renderSel(s.kind, [...s.args, ...self.args])}\` instead of \`as ${s.text} if entity ${self.text}\``);
        }
      }

      if (line.startsWith("execute as ")) {
        const s = sels[0];
        const run = s && s.start === "execute as ".length ? /^ run (.+)$/.exec(line.slice(s.end)) : null;
        if (run && (run[1].match(/@s\b/g) ?? []).length === 1 && MULTI_TARGET.some((r) => r.test(run[1]))) {
          add("redundant-as", line, i, `\`${run[1].replace(/@s\b/, s.text)}\` - the command takes the selector directly`);
        }
      }

      const macro = /^\$scoreboard players set (\S+) (\S+) \$\(\w+\)$/.exec(line);
      if (macro && !`${macro[1]} ${macro[2]}`.includes("$(")) {
        add(
          "macro-score-set",
          line,
          i,
          `a macro line is re-parsed for each new value: \`execute store result score ${macro[1]} ${macro[2]} run data get storage <source> <path>\``,
        );
      }

      if (!tick) continue;

      // --- tick-reachable only ---
      const write = /data (?:modify|merge|remove) entity \S+ (\S+)/.exec(line);
      const typed = write && NBT_WRITE_COMMANDS.find(([re]) => re.test(write[1]));
      if (typed && linePeriod(line, p!) < NBT_READ_MIN_PERIOD) {
        add("nbt-write", line, i, `a command does this without serialising the entity: ${typed[1]}`);
      }

      for (const s of sels) {
        if (!/@[en]/.test(s.kind) || s.args.length === 0) continue;
        if (!hasArg(s, "type") && !unbounded.has(s.text)) {
          add("missing-type", line, i, `add \`type=\` to \`${s.text}\` - the type filter skips every other entity cheaply`);
        }
        const args = s.args.filter(([k]) => k !== "limit" && k !== "sort").map(([k, v]) => `${k}=${v}`).sort();
        const where = s.args.some(([k]) => POSITIONAL.has(k))
          ? line.slice(0, s.start).replace(/\s*(as|at|if entity|unless entity)\s*$/, "")
          : "";
        const key = `${where}|${s.kind}[${args.join(",")}]`;
        const entry = scans.get(key) ?? { sel: s.text, line, lines: new Set<number>() };
        entry.lines.add(i);
        scans.set(key, entry);
      }

      // Advancement triggers over polling players.
      const asPlayer = perPlayer.has(fn) || /\bas @a\b/.test(line);
      const polled = [
        ...sels.filter((s) => s.kind === "@a").flatMap((s) =>
          s.args
            .filter(([k]) => k === "scores")
            .flatMap(([, v]) => splitTop(v.slice(1, -1)).map((kv) => kv.split("=")[0].trim())),
        ),
        ...(asPlayer ? [...line.matchAll(/if score @s (\S+) matches/g)].map((m) => m[1]) : []),
      ];
      const trigger = polled
        .map((obj) => criteria.get(obj))
        .map((c) => c && STAT_TRIGGERS.find(([re]) => re.test(c)))
        .find(Boolean);
      if (trigger) {
        add("poll-trigger", line, i, `polling a stat for a player action: the ${trigger[1]} advancement trigger fires only when it happens`);
      } else if (
        sels.some(
          (s) =>
            s.kind === "@a" &&
            /(^|\s)as $/.test(line.slice(0, s.start)) &&
            (["x", "y", "z"].some((k) => hasArg(s, k))
              ? ["dx", "dy", "dz", "distance"].some((k) => hasArg(s, k))
              : hasArg(s, "distance") && /positioned -?[\d.]+ -?[\d.]+ -?[\d.]+ /.test(line.slice(0, s.start))),
        )
      ) {
        // Only `as @a[…]` acting on players in a fixed area; `if/unless entity @a[…]` is a
        // presence check ("anyone / nobody there"), which a per-player trigger can't replace.
        add("poll-trigger", line, i, LOCATION_HINT);
      } else if (
        new RegExp(`if items entity (@a\\S*${asPlayer ? "|@s" : ""}) (container|armor|inventory|hotbar|player\\.crafting)\\.`).test(line)
      ) {
        add("poll-trigger", line, i, "Trigger.inventoryChanged() fires when a player's inventory changes (a `weapon.*` selection change has no trigger)");
      }
    }

    for (const { sel, line, lines } of scans.values()) {
      if (lines.size < 2) continue;
      const [first] = lines;
      // Already `execute as <sel> run function F`: the fix is folding the rest into F.
      const into = line.startsWith(`execute as ${sel} run function `) ? line.split(" ").pop() : undefined;
      add(
        "repeated-selector",
        line,
        first,
        into
          ? `${lines.size} lines scan \`${sel}\` - move the other scan(s) into \`${into}\`, which already runs as each match`
          : `${lines.size} lines scan \`${sel}\` - scan once: \`execute as ${sel} run function …\` and use \`@s\` inside`,
      );
    }
  }
  return { lints: collapse(lints), allowedLints: collapse(allowedLints) };
}

/** One entry per rule + function + hint (the first line), counting the rest. */
function collapse(lints: Lint[]): Lint[] {
  const out = new Map<string, Lint>();
  for (const l of lints) {
    const key = `${l.rule}|${l.fn}|${l.hint}`;
    const seen = out.get(key);
    if (seen) seen.count = (seen.count ?? 1) + 1;
    else out.set(key, { ...l });
  }
  return [...out.values()];
}

/** Human-readable summary of a {@link CostReport} for printing to a terminal. */
export function formatCostReport(report: CostReport): string {
  const out: string[] = [];
  out.push("Per-tick cost report");
  out.push(
    `  worst case: ${report.totalWorstCaseCommandsPerTick} commands/tick ` +
      `across ${report.tickRoots.length} tick root(s)`,
  );
  for (const r of report.tickRoots) {
    out.push(
      `    ${r.root}: ${r.worstCaseCommands} cmds, ` +
        `${r.reachableFunctions} fn(s)${r.recursive ? " (recursive - lower bound)" : ""}`,
    );
    // Per-call-site breakdown: where the root's budget goes, and the guard each
    // subtree sits behind. Skipped when the root is a single flat body.
    if (r.breakdown.length > 0) {
      if (r.selfCommands > 0) out.push(`      · self: ${r.selfCommands} cmds`);
      for (const c of r.breakdown) {
        const guard = c.guard ? `  ⟵ ${c.guard}` : "";
        out.push(
          `      · ${c.callee}: ${c.commands} cmds, ${c.functions} fn(s)${guard}`,
        );
      }
    }
  }
  if (report.unboundedScanners.length === 0) {
    out.push("  no unbounded @e scans reachable from tick ✓");
  } else {
    out.push(
      `  ${report.unboundedScanners.length} function(s) with unbounded @e scans:`,
    );
    for (const fn of report.unboundedScanners) {
      out.push(`    ${fn.name}: ${fn.unboundedScans.join(", ")}`);
      for (const loc of new Set(fn.scanSources)) if (loc) out.push(`      ↳ ${loc}`);
    }
  }
  for (const w of report.warnings) {
    const line = w.line.length > 120 ? `${w.line.slice(0, 117)}...` : w.line;
    out.push(
      `  WARN nbt read ${w.guarded ? "up to " : ""}every ${w.period} tick(s) in ${w.fn}: ${line}${w.count ? ` (×${w.count})` : ""}\n` +
        (w.hint ? `       → ${w.hint}\n` : "") +
        `       → move it to a t5/t10/t20 clock, or dp.allow("nbt-read", "${w.fn}", why)`,
    );
    if (w.source) out.push(`       ↳ ${w.source}`);
  }
  const allowed = report.nbtReads.filter((r) => r.allowed && r.period < NBT_READ_MIN_PERIOD);
  if (allowed.length > 0) {
    const why = [...new Set(allowed.map((r) => `${r.fn} (${r.allowed})`))];
    out.push(`  ${allowed.length} allowed fast nbt read(s): ${why.join(", ")}`);
  }
  for (const l of report.lints) {
    const line = l.line.length > 120 ? `${l.line.slice(0, 117)}...` : l.line;
    const every = l.period ? ` (${l.guarded ? "up to " : ""}every ${l.period} tick(s))` : "";
    const more = l.count ? ` (+${l.count - 1} similar)` : "";
    out.push(
      `  WARN ${l.rule} in ${l.fn}${every}: ${line}${more}\n` +
        `       → ${l.hint}\n` +
        `       → or dp.allow("${l.rule}", "${l.fn}", why)`,
    );
    if (l.source) out.push(`       ↳ ${l.source}`);
  }
  const byRule = new Map<string, Set<string>>();
  for (const l of report.allowedLints) {
    byRule.set(l.rule, (byRule.get(l.rule) ?? new Set()).add(`${l.fn} (${l.allowed})`));
  }
  for (const [rule, fns] of byRule) out.push(`  allowed ${rule}: ${[...fns].join(", ")}`);
  for (const { rule, fn } of report.staleAllows) {
    out.push(`  WARN dp.allow("${rule}", "${fn}") names no function - renamed or moved? It silences nothing`);
  }
  return out.join("\n");
}
