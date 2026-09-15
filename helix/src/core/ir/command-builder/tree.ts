// Walks a version's command tree: literal paths, argument children and the argument spine.
import { BrigadierNode } from "../../commandtree/tree";
import { VersionProfile } from "../../../versions/profile";
import { literalChildren } from "../command-validator";

export function argChildEntry(
  node: BrigadierNode,
): [string, BrigadierNode] | undefined {
  return Object.entries(node.children ?? {}).find(
    ([, child]) => child.type === "argument",
  );
}

/**
 * Picks which argument child to follow when a command branches (e.g. `teleport`).
 *
 * If more tokens follow, prefer a child with children; otherwise prefer an executable one.
 * Values aren't type-checked, so any viable branch gives the same text.
 */
export function pickArgChild(
  node: BrigadierNode,
  moreFollow: boolean,
): [string, BrigadierNode] | undefined {
  const argChildren = Object.entries(node.children ?? {}).filter(
    ([, child]) => child.type === "argument",
  );
  if (argChildren.length <= 1) return argChildren[0];
  const wants = (child: BrigadierNode) =>
    moreFollow
      ? !!child.children && Object.keys(child.children).length > 0
      : !!child.executable;
  return argChildren.find(([, child]) => wants(child)) ?? argChildren[0];
}

/** The ordered argument-slot names along a command's linear spine. */
export function spineArgNames(node: BrigadierNode): string[] {
  const names: string[] = [];
  let n: BrigadierNode | undefined = node;
  while (n) {
    const entry = argChildEntry(n);
    if (!entry) break;
    names.push(entry[0]);
    n = entry[1];
  }
  return names;
}

export function resolveLiteralPath(
  root: BrigadierNode,
  path: string[],
  version: VersionProfile,
): BrigadierNode {
  let node = root;
  path.forEach((literal, i) => {
    const child = node.children?.[literal];
    if (!child || child.type !== "literal") {
      const where = i === 0 ? "command" : "sub-command";
      const expected = literalChildren(node).sort();
      throw new Error(
        `Unknown ${where} "${literal}" for Minecraft ${version.id}` +
          (expected.length ? ` (expected one of: ${expected.join(", ")})` : ""),
      );
    }
    node = child;
  });
  return node;
}
