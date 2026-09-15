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

/** Whether the version has a real command tree, not a `{}` stub. */
export function hasCommandTree(root: BrigadierNode | undefined): boolean {
  return !!root?.children && Object.keys(root.children).length > 0;
}

/**
 * Checks an emitted command's leading keywords against the version's command tree.
 *
 * Stops at the first argument, since values can contain spaces. Never rejects a valid
 * command;
 * only catches keywords that don't exist (e.g. `random` before 1.20.3).
 */
export function validateCommand(
  command: string,
  version: VersionProfile,
): void {
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

    // An argument can start here, so the rest is out of scope.
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
