// Tick-only rules: costs that matter because the line runs every few ticks.
import { linePeriod } from "../lines";
import { NBT_READ_MIN_PERIOD } from "../nbt-reads";
import { hasArg, splitTop } from "../selectors";
import { LOCATION_HINT, NBT_WRITE_COMMANDS, POSITIONAL, STAT_TRIGGERS } from "./hints";
import type { AddLint, FnState, LineCheck, PackFacts } from "./types";

/** `nbt-write`: an entity NBT write a command can do without serialising the entity. */
export function nbtWrite({ line, i, period, add }: LineCheck): void {
  const write = /data (?:modify|merge|remove) entity \S+ (\S+)/.exec(line);
  const typed = write && NBT_WRITE_COMMANDS.find(([re]) => re.test(write[1]));
  if (typed && linePeriod(line, period!) < NBT_READ_MIN_PERIOD) {
    add("nbt-write", line, i, `a command does this without serialising the entity: ${typed[1]}`);
  }
}

/** Records this line's narrowed `@e`/`@n` scans for {@link repeatedSelector}. */
export function collectScans({ line, i, sels }: LineCheck, state: FnState): void {
  for (const s of sels) {
    if (!/@[en]/.test(s.kind) || s.args.length === 0) continue;
    const args = s.args.filter(([k]) => k !== "limit" && k !== "sort").map(([k, v]) => `${k}=${v}`).sort();
    // Positional selectors scan a different set per execute context, so the context is part of the key.
    const where = s.args.some(([k]) => POSITIONAL.has(k))
      ? line.slice(0, s.start).replace(/\s*(as|at|if entity|unless entity)\s*$/, "")
      : "";
    const key = `${where}|${s.kind}[${args.join(",")}]`;
    const entry = state.scans.get(key) ?? { sel: s.text, line, lines: new Set<number>() };
    entry.lines.add(i);
    state.scans.set(key, entry);
  }
}

/** `repeated-selector`: the same scan on more than one line of a function. */
export function repeatedSelector(state: FnState, add: AddLint): void {
  for (const { sel, line, lines } of state.scans.values()) {
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

/** `poll-trigger`: polling for a player action an advancement trigger reports. */
export function pollTrigger({ fn, line, i, sels, add }: LineCheck, { criteria, perPlayer }: PackFacts): void {
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
    // Only `as @a[…]` in a fixed area; `if entity @a[…]` is a presence check a trigger
    // can't replace.
    add("poll-trigger", line, i, LOCATION_HINT);
  } else if (
    new RegExp(`if items entity (@a\\S*${asPlayer ? "|@s" : ""}) (container|armor|inventory|hotbar|player\\.crafting)\\.`).test(line)
  ) {
    add("poll-trigger", line, i, "Trigger.inventoryChanged() fires when a player's inventory changes (a `weapon.*` selection change has no trigger)");
  }
}
