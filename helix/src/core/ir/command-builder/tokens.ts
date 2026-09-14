import { BrigadierNode } from "../commandtree/tree";
import { VersionProfile } from "../../versions/profile";
import { ArgInput, toCommandValue } from "../values/value";
import { hasCommandTree, literalChildren } from "./command-validator";

export type ArgValue = string | number;

/** Renders an argument for the target version. Handlers call this at codegen. */
export const renderArg = (value: ArgInput, version: VersionProfile): string =>
  toCommandValue(value).render(version);

function argChildEntry(
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
function pickArgChild(
  node: BrigadierNode,
  moreFollow: boolean,
): [string, BrigadierNode] | undefined {
  const argChildren = Object.entries(node.children ?? {}).filter(
    ([, child]) => child.type === "argument",
  );
  if (argChildren.length <= 1) return argChildren[0];
  const wants = (child: BrigadierNode) =>
    moreFollow ? !!child.children && Object.keys(child.children).length > 0 : !!child.executable;
  return argChildren.find(([, child]) => wants(child)) ?? argChildren[0];
}

/** The ordered argument-slot names along a command's linear spine. */
function spineArgNames(node: BrigadierNode): string[] {
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

function resolveLiteralPath(
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

/**
 * An explicit token list for commands named arguments can't express: literals after
 * arguments
 * (`trigger ... set`) and `execute ... run <nested>`. Still validated against the tree.
 */
export type Token =
  | { kind: "literal"; text: string }
  | { kind: "arg"; value: string }
  | { kind: "raw"; text: string };

export const lit = (text: string): Token => ({ kind: "literal", text });
export const arg = (value: ArgValue): Token => ({
  kind: "arg",
  value: String(value),
});
export const raw = (text: string): Token => ({ kind: "raw", text });

export function buildTokens(version: VersionProfile, tokens: Token[]): string {
  const root = version.commands as BrigadierNode;
  const parts: string[] = [];

  if (!hasCommandTree(root)) {
    for (const tok of tokens) {
      parts.push(tok.kind === "arg" ? tok.value : tok.text);
    }
    return parts.join(" ");
  }

  let node = root;
  let validating = true;

  tokens.forEach((tok, i) => {
    if (tok.kind === "raw") {
      validating = false;
      parts.push(tok.text);
      return;
    }
    if (!validating) {
      parts.push(tok.kind === "arg" ? tok.value : tok.text);
      return;
    }
    if (tok.kind === "literal") {
      const child = node.children?.[tok.text];
      if (!child || child.type !== "literal") {
        const where = i === 0 ? "command" : "sub-command";
        const expected = literalChildren(node).sort();
        throw new Error(
          `Unknown ${where} "${tok.text}" for Minecraft ${version.id}` +
            (expected.length ? ` (expected one of: ${expected.join(", ")})` : ""),
        );
      }
      node = child;
      parts.push(tok.text);
    } else {
      // Does any later token still need a slot? (raw tails end validation.)
      const moreFollow = tokens
        .slice(i + 1)
        .some((t) => t.kind === "arg" || t.kind === "literal");
      const argEntry = pickArgChild(node, moreFollow);
      if (!argEntry) {
        throw new Error(
          `Command "${parts.join(" ")}" takes no argument at position ${
            i + 1
          } for Minecraft ${version.id}`,
        );
      }
      node = argEntry[1];
      parts.push(tok.value);
    }
  });

  if (validating && !node.executable) {
    throw new Error(
      `Command "${parts.join(" ")}" is not executable for Minecraft ${version.id}`,
    );
  }

  return parts.join(" ");
}
