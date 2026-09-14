// Renders a chain link as command text (after `execute`'s first link) or as validated tokens (the first link).
import { ExpressionNode, Range } from "../../ir/node";
import { arg, lit, Token } from "../../ir/command-builder";
import { VersionProfile } from "../../../versions/profile";
import { Selector } from "../../frontend/nodes/selector";
import { toCommandValue } from "../../values/value";
import { renderExistence } from "../selector";
import type { ChainLink } from "./links";
import { PredicateCheckNode, ScoreCompareNode, ScoreRangeNode } from "./nodes";

/** Full rendered fragment for one chain link, including its own leading keyword(s). */
export function linkText(link: ChainLink, version: VersionProfile): string {
  if (link.kind === "entity") {
    return `${link.mode} entity ${renderExistence(link.selector, version)}`;
  }
  if (link.kind === "near") {
    return nearLinkText(link, version);
  }
  return `${link.mode} ${conditionText(link.cond, version)}`;
}

function nearLinkText(
  link: Extract<ChainLink, { kind: "near" }>,
  version: VersionProfile,
): string {
  const posStr = toCommandValue(link.pos).render(version);
  const near = Selector.allPlayers().distance(new Range(undefined, link.radius));
  const nearStr = link.perPlayer
    ? toCommandValue(near).render(version)
    : renderExistence(near, version);
  const guard = link.unlessSelector
    ? ` unless entity ${renderExistence(link.unlessSelector, version)}`
    : "";
  const match = link.perPlayer ? `as ${nearStr}` : `if entity ${nearStr}`;
  return `positioned ${posStr} ${match}${guard}`;
}

function conditionText(cond: ExpressionNode, version: VersionProfile): string {
  if (cond instanceof PredicateCheckNode) {
    return `predicate ${cond.predicateId}`;
  }
  if (cond instanceof ScoreRangeNode) {
    return `score ${toCommandValue(cond.target).render(version)} ${
      cond.targetObjective.objective
    } matches ${cond.range ?? "*"}`;
  }
  if (cond instanceof ScoreCompareNode) {
    return `score ${toCommandValue(cond.target).render(version)} ${
      cond.targetObjective.objective
    } ${cond.operator} ${toCommandValue(cond.source).render(version)} ${
      cond.sourceObjective.objective
    }`;
  }
  throw new Error("Unsupported condition");
}

/** Full token sequence for one chain link, including its own leading keyword(s). */
export function linkTokens(link: ChainLink, version: VersionProfile): Token[] {
  if (link.kind === "entity") {
    return [
      lit(link.mode),
      lit("entity"),
      arg(renderExistence(link.selector, version)),
    ];
  }
  if (link.kind === "near") {
    return nearLinkTokens(link, version);
  }
  return [lit(link.mode), ...condition(link.cond, version)];
}

function nearLinkTokens(
  link: Extract<ChainLink, { kind: "near" }>,
  version: VersionProfile,
): Token[] {
  const near = Selector.allPlayers().distance(new Range(undefined, link.radius));
  const tokens: Token[] = [
    lit("positioned"),
    arg(toCommandValue(link.pos).render(version)),
    lit(link.perPlayer ? "as" : "if"),
    ...(link.perPlayer ? [] : [lit("entity")]),
    arg(link.perPlayer ? toCommandValue(near).render(version) : renderExistence(near, version)),
  ];
  if (link.unlessSelector) {
    tokens.push(
      lit("unless"),
      lit("entity"),
      arg(renderExistence(link.unlessSelector, version)),
    );
  }
  return tokens;
}

function condition(cond: ExpressionNode, version: VersionProfile): Token[] {
  if (cond instanceof PredicateCheckNode) {
    return [lit("predicate"), arg(cond.predicateId)];
  }
  if (cond instanceof ScoreRangeNode) {
    return [
      lit("score"),
      arg(toCommandValue(cond.target).render(version)),
      arg(cond.targetObjective.objective),
      lit("matches"),
      arg(`${cond.range ?? "*"}`),
    ];
  }
  if (cond instanceof ScoreCompareNode) {
    return [
      lit("score"),
      arg(toCommandValue(cond.target).render(version)),
      arg(cond.targetObjective.objective),
      lit(cond.operator),
      arg(toCommandValue(cond.source).render(version)),
      arg(cond.sourceObjective.objective),
    ];
  }
  throw new Error("Unsupported condition");
}
