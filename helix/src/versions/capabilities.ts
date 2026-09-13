import { BrigadierNode } from "../core/commandtree/tree";
import { VersionProfile } from "./profile";

/**
 * Whether a version's command tree has this command, so unsupported calls fail at the
 * author's call.
 * Returns true without a tree, so stub profiles aren't blocked.
 */
export function supportsCommand(
  version: VersionProfile,
  path: string[],
): boolean {
  const root = version.commands as BrigadierNode;
  if (!root || !root.children) return true; // no tree to check against

  let node: BrigadierNode = root;
  for (const literal of path) {
    const child = node.children?.[literal];
    if (!child) return false;
    node = child;
  }
  return true;
}

/** Throw a clear, version-named error if a command is unavailable on the target. */
export function requireCommand(
  version: VersionProfile,
  path: string[],
  feature = path.join(" "),
): void {
  if (!supportsCommand(version, path)) {
    throw new Error(
      `"${feature}" is not available in Minecraft ${version.id} ` +
        `(the command "${path.join(" ")}" does not exist in this version)`,
    );
  }
}
