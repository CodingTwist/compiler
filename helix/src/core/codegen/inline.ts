// Inlines private helper functions that render to a single command into their call sites.
import type { Datapack } from "../ir/datapack";
import { isPrivate } from "../private-fn";
import { runClause } from "../ir/generate";

/** The lone command of `text`, or `undefined` if it has more, none, or can't be inlined. */
function soleCommand(text: string): string | undefined {
  const cmds = text.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
  if (cmds.length !== 1) return undefined;
  const cmd = cmds[0];
  // A macro line needs its own function, and `return` would exit the caller instead.
  if (cmd.startsWith("$") || /\breturn\b/.test(cmd)) return undefined;
  return cmd;
}

/**
 * Replaces calls to single-command private functions with the command, and drops the
 * function once nothing else names it.
 *
 * Only plain `function`, `execute … run function` and `return run function` calls are
 * replaced; `store`, `if function`, `schedule`, tags and macro calls depend on the call
 * itself, so they keep the file. Public functions are left alone so they stay callable
 * and show up by name in profiles. `otherFiles` are the pack's JSON outputs, which may
 * name functions too.
 */
export function inlineSingleCommandFunctions(dp: Datapack, otherFiles: Iterable<string>): void {
  const prefix = `${dp.name}:`;
  // Lint allows are keyed by function name, so inlining would move the line out of reach.
  const allowed = new Set([...dp.allowed.values()].flatMap((fns) => [...fns.keys()]));
  // `store` reads the call's result, which a function without `return` doesn't have.
  const callRe = /^(execute (?!.*\bstore\b).*? run )?(return run )?function (\S+)$/;
  // `return run` stops after the first branch of a fork, so those can't go under it.
  const forks = /\s(as|at|on|summon)\s|facing entity/;
  const bodies = new Map<string, string>();
  // Only functions that lost a call are dropped; an uncalled one may be run by hand.
  const replaced = new Set<string>();

  for (let changed = true; changed; ) {
    changed = false;
    bodies.clear();
    for (const [name, text] of dp.files) {
      if (!isPrivate(name) || allowed.has(name)) continue;
      const cmd = soleCommand(text);
      if (cmd !== undefined && !cmd.split(" ").includes(`${prefix}${name}`)) bodies.set(name, cmd);
    }
    for (const [name, text] of dp.files) {
      const lines = text.split("\n");
      let edited = false;
      lines.forEach((line, i) => {
        const m = callRe.exec(line);
        if (!m || !m[3].startsWith(prefix)) return;
        const [, exec, ret, ref] = m;
        const callee = ref.slice(prefix.length);
        const body = bodies.get(callee);
        if (body === undefined || callee === name || (ret && forks.test(body))) return;
        if (ret) lines[i] = `${exec ?? ""}return run ${body}`;
        else if (exec) lines[i] = `${exec.slice(0, -" run ".length)} ${runClause(body)}`;
        else lines[i] = body;
        replaced.add(callee);
        edited = true;
      });
      if (edited) {
        dp.files.set(name, lines.join("\n"));
        changed = true;
      }
    }
  }

  // Names still mentioned anywhere (tags, schedules, `if function`, …) keep their file.
  const referenced = new Set<string>();
  const refRe = new RegExp(`${dp.name}:([\\w./-]+)`, "g");
  for (const text of [...dp.files.values(), ...otherFiles]) {
    for (const m of text.matchAll(refRe)) referenced.add(m[1]);
  }
  for (const name of replaced) {
    if (referenced.has(name)) continue;
    dp.files.delete(name);
    dp.sourceMap.delete(name);
    dp.inlined.add(name);
  }
}
