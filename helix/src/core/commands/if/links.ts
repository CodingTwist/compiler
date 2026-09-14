// Chain links: the guards an `if` chain folds into one `execute … if … if … run`.
import { ASTNode, ExpressionNode, FunctionNode } from "../../ir/node";
import { Selector } from "../../frontend/nodes/selector";
import { Pos } from "../../values";
import { EntityGuardNode } from "../entity_guard";
import { NearGuardNode } from "../near_guard";
import { IfElseNode } from "./nodes";

/**
 * One link in an `execute` chain: a score condition, an entity guard, or a near-player
 * guard.
 */
export type ChainLink =
  | { kind: "score"; mode: "if" | "unless"; cond: ExpressionNode }
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
  if (node instanceof IfElseNode && node.elifs.length === 0 && !node.elseBody) {
    return {
      link: { kind: "score", mode: "if", cond: node.condition },
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
