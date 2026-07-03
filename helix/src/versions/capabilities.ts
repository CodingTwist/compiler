import { BrigadierNode } from "../core/commandtree/tree";
import { VersionProfile } from "./profile";

/**
 * Capability queries against a version's command tree. The authoring (frontend)
 * layer uses these to reject an unsupported command EARLY - at the author call -
 * instead of waiting for codegen. It only asks "does this version express this?";
 * it never changes the author-facing API per version (that would break the
 * write-once-target-many property). Returns true when no tree is present, so
 * hand-stubbed profiles without a `commands` tree are never falsely gated.
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
