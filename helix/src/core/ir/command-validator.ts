import { BrigadierNode } from "../commandtree/tree";
import { VersionProfile } from "../../versions/profile";

export function literalChildren(node: BrigadierNode): string[] {
  if (!node.children) return [];
  return Object.entries(node.children)
    .filter(([, child]) => child.type === "literal")
    .map(([name]) => name);
}

export function hasArgumentChild(node: BrigadierNode): boolean {
  return (
    !!node.children &&
    Object.values(node.children).some((child) => child.type === "argument")
  );
}

/** Whether the version actually ships a command tree (vs. a `{}` stub). */
export function hasCommandTree(root: BrigadierNode | undefined): boolean {
  return !!root?.children && Object.keys(root.children).length > 0;
}

/**
 * Validate an emitted command against the target version's Brigadier command
 * tree.
 *
 * Commands are version-specific: a command or sub-command keyword may not exist
 * in the target version (e.g. `random` before 1.20.3). This walks the leading
 * run of literal keywords and throws a clear error if one is not a valid
 * command / sub-command for the version.
 *
 * It deliberately STOPS at the first argument position rather than parsing
 * argument values - those can span whitespace (selectors, JSON, NBT) and are
 * validated elsewhere (e.g. registry ids). The guarantee is one-directional:
 * it never rejects a valid command, it only flags impossible literal paths.
 */
export function validateCommand(command: string, version: VersionProfile): void {
  // A leading `$` marks a macro line; the command keyword follows it.
  const trimmed = command.trim().replace(/^[/$]/, "");
  if (!trimmed || trimmed.startsWith("#")) return;

  const root = version.commands as BrigadierNode;
  if (!hasCommandTree(root)) return;

  const tokens = trimmed.split(/\s+/);
  let node: BrigadierNode = root;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const child = node.children?.[token];

    if (child && child.type === "literal") {
      node = child;
      continue;
    }

    // Not a literal keyword here. If arguments can begin, the validated prefix
    // is fine and the rest is out of scope.
    if (hasArgumentChild(node)) return;

    // No argument is allowed here, so a literal was expected.
    const expected = literalChildren(node);
    if (expected.length > 0) {
      const where = i === 0 ? "command" : "sub-command";
      throw new Error(
        `Unknown ${where} "${token}" for Minecraft ${version.id} ` +
          `(expected one of: ${expected.sort().join(", ")})`,
      );
    }

    // Executable leaf with trailing tokens we can't account for: stop safely.
    return;
  }
}
