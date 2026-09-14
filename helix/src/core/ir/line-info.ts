// Facts each handler records about the lines it emits, for passes that rewrite rendered
// output (grouping, inlining) without re-parsing command text.
import type { SelectorNode } from "../commands/selector";
import { NbtPath, NbtPathValue, type NbtValue } from "../values/nbt";
import type { VersionProfile } from "../../versions/profile";
import { Path } from "../values/paths";
import type { CommandValue } from "../values/value";

/**
 * What a shared `execute` clause depends on.
 *
 * `pure` never changes between lines, `self` depends on where the executor is, and `other`
 * depends on which entity a selector picks.
 */
export type ClauseKind = "pure" | "self" | "other";

/** A leading `execute` context clause that neighbouring lines may share. */
export interface SharedClause {
  /** The clause exactly as rendered in the line, e.g. `at @s`. */
  text: string;
  kind: ClauseKind;
  /** Resolving it scans entities, so sharing it saves more than one command. */
  scans: boolean;
  /**
   * It can pick several entities, so a group runs whole per entity instead of line by line.
   * Only lines that are {@link LineInfo.local} may share it.
   */
  forks: boolean;
}

/**
 * The most a line can do to entities: nothing, change them in place, or move or remove them.
 *
 * `NONE` must not touch entities at all; `EDITS` may change them but never moves, rotates
 * or removes one.
 */
export const Effect = { NONE: "none", EDITS: "edits", MOVES: "moves" } as const;
export type Effect = (typeof Effect)[keyof typeof Effect];

/** What a rendered line is, as far as output passes need to know. */
export interface LineInfo {
  /** Leading context clauses, up to the first one that can't be shared. */
  clauses: SharedClause[];
  /** `clauses` is every clause before the command, so a spliced-in body's clauses follow on. */
  open: boolean;
  /** The line's own effect; `moves` when unknown. Calls add their bodies' effects. */
  effect: Effect;
  /** Functions of this pack the line runs. */
  calls: string[];
  /** Holds a `return`, which exits whatever function the line ends up in. */
  exits: boolean;
  /** A comment or blank line, which moves with the lines around it. */
  comment: boolean;
  /**
   * Its own commands only read and write the executing entity, so entities can run it in
   * any order. Calls count only if their bodies are local too.
   */
  local: boolean;
}

const RANK: Record<Effect, number> = { none: 0, edits: 1, moves: 2 };

/** The strongest of `effects`. */
export function worst(...effects: Effect[]): Effect {
  return effects.reduce<Effect>((a, b) => (RANK[b] > RANK[a] ? b : a), Effect.NONE);
}

/** A plain command with no `execute` clauses. */
export function commandLine(effect: Effect, more: Partial<LineInfo> = {}): LineInfo {
  return { clauses: [], open: true, effect, calls: [], exits: false, comment: false, local: false, ...more };
}

/** A comment or blank line. */
export const COMMENT_LINE: LineInfo = commandLine(Effect.NONE, { comment: true, local: true });

/** A line nothing is known about, e.g. a native plugin call. */
export const UNKNOWN_LINE: LineInfo = commandLine(Effect.MOVES, { open: false });

/** `function <ns>:<name>`. */
export const callLine = (name: string): LineInfo => commandLine(Effect.NONE, { calls: [name], local: true });

/**
 * `execute <prefix> run <body>` (or a bare chain when `body` is missing).
 *
 * `prefix` holds each clause in order, `undefined` where one can't be shared. `own` and
 * `ownCalls` come from the clauses themselves (`store`, `if function`).
 */
export function chainLine(
  prefix: (SharedClause | undefined)[],
  body: LineInfo | undefined,
  own: Effect = Effect.NONE,
  ownCalls: string[] = [],
): LineInfo {
  const cut = prefix.indexOf(undefined);
  const lead = (cut < 0 ? prefix : prefix.slice(0, cut)) as SharedClause[];
  const open = cut < 0 && body !== undefined;
  return {
    // `runClause` merges a nested `execute`, so its clauses continue this chain.
    clauses: open && body ? [...lead, ...body.clauses] : lead,
    open: open && !!body?.open,
    effect: worst(own, body?.effect ?? Effect.NONE),
    calls: [...ownCalls, ...(body?.calls ?? [])],
    exits: body?.exits ?? false,
    comment: false,
    // A condition, a store or another entity's clause reads or writes more than `@s`.
    local: open && !!body?.local && lead.every((c) => c.kind !== "other"),
  };
}

/**
 * A call line after `callee`'s one command `body` replaced the call.
 *
 * `returns` is for `return run function`, which now returns the body's result directly.
 */
export function spliceCall(caller: LineInfo, callee: string, body: LineInfo, returns: boolean): LineInfo {
  const open = caller.open && !returns;
  return {
    clauses: open ? [...caller.clauses, ...body.clauses] : caller.clauses,
    open: open && body.open,
    effect: worst(caller.effect, body.effect),
    calls: [...caller.calls.filter((c) => c !== callee), ...body.calls],
    exits: caller.exits || body.exits || returns,
    comment: false,
    local: caller.local && body.local,
  };
}

/**
 * A clause that picks `sel` (`as`, `at`, `positioned as`, …), or `undefined` when grouping
 * would change what it picks.
 *
 * `executor` is true for `as`, where plain `@s` changes nothing.
 */
export function selectorClause(text: string, sel: SelectorNode, executor = false): SharedClause | undefined {
  // Picked once for a group instead of once per line: a different entity each time.
  if (sel.picksRandomly()) return undefined;
  // Any line may touch the scores, NBT or state these test.
  if (sel.readsState()) return undefined;
  if (!sel.picksOne()) {
    // Only `as` gives each entity its own `@s`; `at` would run every group at the same executor.
    return executor ? { text, kind: "other", scans: sel.scans(), forks: true } : undefined;
  }
  if (sel.isBareSelf()) return { text, kind: executor ? "pure" : "self", scans: false, forks: false };
  return { text, kind: "other", scans: sel.scans(), forks: false };
}

/** A clause that reads nothing a line could change, e.g. `in` or `positioned <pos>`. */
export const pureClause = (text: string): SharedClause => ({ text, kind: "pure", scans: false, forks: false });

/** Whether a command's `args` point at nothing but the executing entity. */
export const onlySelf = (args: CommandValue[]): boolean => args.every((a) => a.reach?.() !== "world");

/** Effect of writing NBT `path` on an entity. A path that isn't a plain {@link NbtPathValue} may be anything. */
export function entityWriteEffect(path: CommandValue): Effect {
  if (!(path instanceof NbtPathValue)) return Effect.MOVES;
  return [Path.Entity.Pos, Path.Entity.Rotation].some((p) => path.within(p)) ? Effect.MOVES : Effect.EDITS;
}

/** Effect of merging `value` into an entity. Raw SNBT may hold `Pos` or `Rotation`. */
export function entityMergeEffect(value: NbtValue, version: VersionProfile): Effect {
  const keys = value.keys(version);
  return keys ? worst(...keys.map((k) => entityWriteEffect(NbtPath(k)))) : Effect.MOVES;
}
