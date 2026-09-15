// Exact rules: a line with an equivalent cheaper form. They check every function.
import { hasArg, renderSel, selectorsIn } from "../selectors";
import { MULTI_TARGET, inRange } from "./hints";
import type { AddLint, FnState, LineCheck } from "./types";

/** `constant-condition`: a `matches` check on a fake player set earlier in the function. */
export function constantCondition(
  { line, i, add }: LineCheck,
  state: FnState,
): void {
  const { known } = state;
  const checks =
    /\b(if|unless) score ([^@\s$]\S*) (\S+) matches ([-\d.]+)(?=\s|$)/g;
  for (const m of line.matchAll(checks)) {
    const value = known.get(`${m[2]} ${m[3]}`);
    if (value === undefined) continue;
    const passes = inRange(value, m[4]) === (m[1] === "if");
    add(
      "constant-condition",
      line,
      i,
      passes
        ? `\`${m[2]} ${m[3]}\` is ${value} here (set earlier in this function), so \`${m[0]}\` always passes - drop it`
        : `\`${m[2]} ${m[3]}\` is ${value} here (set earlier in this function), so \`${m[0]}\` never passes - this line never runs`,
    );
  }
  // Any call may change a score; any mention besides a `matches` check may write it.
  if (/\bfunction /.test(line)) known.clear();
  const writes = line.replace(checks, "");
  for (const key of known.keys())
    if (writes.includes(` ${key}`)) known.delete(key);
  const set = /^scoreboard players set ([^@\s$]\S*) (\S+) (-?\d+)$/.exec(line);
  if (set) known.set(`${set[1]} ${set[2]}`, Number(set[3]));
}

/** `group-execute`: tracks runs of lines sharing an execute prefix, reporting each when it ends. */
export function groupExecute(
  { line, i, add }: LineCheck,
  state: FnState,
): void {
  const prefix = /^execute (.+?) (?:run|store) /.exec(line)?.[1];
  const groupable =
    prefix &&
    !/\b(if|unless)\b/.test(prefix) &&
    !/ run return\b/.test(line) &&
    prefix;
  if (!groupable || groupable !== state.group?.prefix) flushGroup(state, add);
  if (groupable) state.group ??= { prefix: groupable, line, i, count: 0 };
  if (state.group) state.group.count++;
}

/** Reports the current execute-prefix run if it's long enough, then clears it. */
export function flushGroup(state: FnState, add: AddLint): void {
  const { group } = state;
  // Same bar as the grouping pass: without a scan, the call costs what two prefixes save.
  if (group && group.count >= (/@[aeprn]\b/.test(group.prefix) ? 2 : 3)) {
    add(
      "group-execute",
      group.line,
      group.i,
      `${group.count} lines in a row start \`execute ${group.prefix}\` - run it once: \`execute ${group.prefix} run function …\` (keep them apart if an earlier line changes who or where the prefix picks)`,
    );
  }
  state.group = undefined;
}

/** `vacuous-execute`: `execute run` with no subcommands. */
export function vacuousExecute({ line, i, add }: LineCheck): void {
  if (/^\$?execute run /.test(line)) {
    add(
      "vacuous-execute",
      line,
      i,
      "`execute run <cmd>` with no subcommands is just `<cmd>`",
    );
  }
}

/** `fold-into-selector`: `as <sel> if score|entity @s…` right after `as`. */
export function foldIntoSelector({ line, i, sels, add }: LineCheck): void {
  for (const s of sels) {
    if (!/(^|\s)as $/.test(line.slice(0, s.start))) continue;
    // `limit`/`sort` pick before the check, so folding would change who matches.
    if (hasArg(s, "limit") || hasArg(s, "sort") || /@[prn]/.test(s.kind))
      continue;
    const rest = line.slice(s.end);
    const score = /^ if score @s (\S+) matches (\S+)/.exec(rest);
    if (score) {
      if (hasArg(s, "scores")) continue; // merging into an existing scores={} is left to the author
      add(
        "fold-into-selector",
        line,
        i,
        `\`${renderSel(s.kind, [...s.args, ["scores", `{${score[1]}=${score[2]}}`]])}\` instead of \`as ${s.text}${score[0]}\``,
      );
      continue;
    }
    const ent = /^ if entity (@s\[)/.exec(rest);
    if (ent) {
      const self = selectorsIn(rest.slice(" if entity ".length))[0];
      const repeatable = new Set(["tag", "nbt", "predicate"]);
      if (
        self.args.some(
          ([k, v]) => !repeatable.has(k) && !v.startsWith("!") && hasArg(s, k),
        )
      )
        continue;
      add(
        "fold-into-selector",
        line,
        i,
        `\`as ${renderSel(s.kind, [...s.args, ...self.args])}\` instead of \`as ${s.text} if entity ${self.text}\``,
      );
    }
  }
}

/** `redundant-as`: `execute as <sel> run <cmd @s>` for a command that takes the selector itself. */
export function redundantAs({ line, i, sels, add }: LineCheck): void {
  if (!line.startsWith("execute as ")) return;
  const s = sels[0];
  const run =
    s && s.start === "execute as ".length
      ? /^ run (.+)$/.exec(line.slice(s.end))
      : null;
  if (
    run &&
    (run[1].match(/@s\b/g) ?? []).length === 1 &&
    MULTI_TARGET.some((r) => r.test(run[1]))
  ) {
    add(
      "redundant-as",
      line,
      i,
      `\`${run[1].replace(/@s\b/, s.text)}\` - the command takes the selector directly`,
    );
  }
}

/** `macro-score-set`: a macro line setting a score, re-parsed for each new value. */
export function macroScoreSet({ line, i, add }: LineCheck): void {
  const macro = /^\$scoreboard players set (\S+) (\S+) \$\(\w+\)$/.exec(line);
  if (macro && !`${macro[1]} ${macro[2]}`.includes("$(")) {
    add(
      "macro-score-set",
      line,
      i,
      `a macro line is re-parsed for each new value: \`execute store result score ${macro[1]} ${macro[2]} run data get storage <source> <path>\``,
    );
  }
}

/** `missing-type`: `@e`/`@n` without `type=`. Tick code's bare `@e` is an unbounded scan instead. */
export function missingType(
  { line, i, sels, period, add }: LineCheck,
  state: FnState,
): void {
  for (const s of sels) {
    if (
      /@[en]/.test(s.kind) &&
      !hasArg(s, "type") &&
      !(period !== undefined && state.unbounded.has(s.text))
    ) {
      add(
        "missing-type",
        line,
        i,
        "add `type=` to `@e`/`@n` selectors - the type filter skips every other entity cheaply",
      );
    }
  }
}
