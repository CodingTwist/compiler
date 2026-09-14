// Builds a command from an explicit token list, validated against the version's tree until a raw tail.
import { BrigadierNode } from "../../commandtree/tree";
import { VersionProfile } from "../../../versions/profile";
import { ArgInput, toCommandValue } from "../../values/value";
import { hasCommandTree, literalChildren } from "../command-validator";
import { pickArgChild } from "./tree";

export type ArgValue = string | number;

/** Renders an argument for the target version. Handlers call this at codegen. */
export const renderArg = (value: ArgInput, version: VersionProfile): string =>
  toCommandValue(value).render(version);

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
