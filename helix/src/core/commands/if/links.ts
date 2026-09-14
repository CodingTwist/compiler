// Chain links: the guards an `if` chain folds into one `execute … if … if … run`.
import { ASTNode, FunctionNode } from "../../ir/node";
import { Selector } from "../../frontend/nodes/selector";
import { Pos } from "../../values";
import { EntityGuardNode } from "../entity_guard";
import { NearGuardNode } from "../near_guard";
import { IfElseNode } from "./nodes";
import { toChains, type Chain } from "./normalize";

/**
 * One link in an `execute` chain: condition clauses, an entity guard, or a near-player
 * guard.
 */
export type ChainLink =
  | { kind: "clauses"; clauses: Chain }
  | { kind: "entity"; mode: "if" | "unless"; selector: Selector | string }
  | {
      kind: "near";
      pos: Pos;
      radius: number;
      unlessSelector?: Selector;
      perPlayer: boolean;
    };

/** Recognize one foldable guard layer and what's inside it, or nothing. */
export function foldLink(
  node: ASTNode,
): { link: ChainLink; next: { kind: "body"; body: FunctionNode } | { kind: "node"; node: ASTNode } } | undefined {
  // An `or` needs its own `return run` lines, so only a single chain folds.
  const chains = node instanceof IfElseNode && !node.elifs.length && !node.elseBody && toChains(node.condition);
  if (node instanceof IfElseNode && chains && chains.length === 1) {
    return {
      link: { kind: "clauses", clauses: chains[0] },
      next: { kind: "body", body: node.thenBody },
    };
  }
  if (node instanceof EntityGuardNode) {
    return {
      link: { kind: "entity", mode: node.mode, selector: node.selector },
      next: { kind: "node", node: node.command },
    };
  }
  if (node instanceof NearGuardNode) {
    return {
      link: {
        kind: "near",
        pos: node.pos,
        radius: node.radius,
        unlessSelector: node.unlessSelector,
        perPlayer: node.perPlayer,
      },
      next: { kind: "node", node: node.command },
    };
  }
  return undefined;
}
