import type { Datapack } from "../../../ir/datapack";
import type { LintRule } from "../types";
import { directCallSites } from "../lines";
import { cadence } from "../cadence";
import type { PackFacts } from "./types";

/** Returns why `rule` is allowed for `fn`, following each allow down the call tree. */
export function allowLookup(dp: Datapack, roots: string[]) {
  const allowWalks = new Map<LintRule, Map<string, string | undefined>>();
  return (rule: LintRule, fn: string): string | undefined => {
    const allows = dp.allowed.get(rule);
    if (!allows?.size) return undefined;
    if (!allowWalks.has(rule)) allowWalks.set(rule, cadence(dp, roots, allows).allowedBy);
    return allowWalks.get(rule)!.get(fn) ?? allows.get(fn);
  };
}

/** Stat criteria per objective and the functions that run as each player. */
export function packFacts(dp: Datapack, roots: string[]): PackFacts {
  const criteria = new Map<string, string>();
  for (const text of dp.files.values()) {
    for (const m of text.matchAll(/^scoreboard objectives add (\S+) (\S+)/gm)) criteria.set(m[1], m[2]);
  }

  // Called behind `as @a…` and down through calls that keep `@s`.
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
  return { criteria, perPlayer };
}
