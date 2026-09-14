// Builds a command from a literal path and named arguments, ordered by the version's tree.
import { BrigadierNode } from "../../commandtree/tree";
import { VersionProfile } from "../../../versions/profile";
import { hasCommandTree, literalChildren } from "../command-validator";
import type { ArgValue } from "./tokens";
import { argChildEntry, resolveLiteralPath, spineArgNames } from "./tree";

/**
 * Builds a command from a literal path and named arguments, in the order the version's tree
 * gives.
 *
 * So a version that reorders arguments still gets correct output. `tail` adds literals
 * after
 * the arguments (e.g. `setblock <pos> <block> keep`).
 *
 * Throws on unknown literals, unmatched names, or a missing required argument.
 * Uses insertion order when the profile has no command tree.
 */
export function buildCommand(
  version: VersionProfile,
  path: string[],
  args: Record<string, ArgValue> = {},
  tail: string[] = [],
): string {
  const root = version.commands as BrigadierNode;

  if (!hasCommandTree(root)) {
    return [...path, ...Object.values(args).map(String), ...tail].join(" ");
  }

  const argRoot = resolveLiteralPath(root, path, version);
  const parts = [...path];

  let node = argRoot;
  const remaining = new Map<string, ArgValue>(Object.entries(args));
  for (let entry = argChildEntry(node); entry; entry = argChildEntry(node)) {
    const [name, child] = entry;
    if (!remaining.has(name)) break; // optional tail the caller didn't supply
    parts.push(String(remaining.get(name)));
    remaining.delete(name);
    node = child;
  }

  for (const literal of tail) {
    const child = node.children?.[literal];
    if (!child || child.type !== "literal") {
      const expected = literalChildren(node).sort();
      throw new Error(
        `Unknown sub-command "${literal}" after "${parts.join(" ")}" for ` +
          `Minecraft ${version.id}` +
          (expected.length ? ` (expected one of: ${expected.join(", ")})` : ""),
      );
    }
    parts.push(literal);
    node = child;
  }

  if (remaining.size > 0) {
    throw new Error(
      `Unknown argument(s) "${[...remaining.keys()].join(", ")}" for ` +
        `"${path.join(" ")}" in Minecraft ${version.id} ` +
        `(slots: ${spineArgNames(argRoot).join(", ") || "none"})`,
    );
  }
  if (!node.executable) {
    throw new Error(
      `Command "${parts.join(" ")}" is missing required arguments for ` +
        `Minecraft ${version.id} (slots: ${spineArgNames(argRoot).join(", ")})`,
    );
  }

  return parts.join(" ");
}
