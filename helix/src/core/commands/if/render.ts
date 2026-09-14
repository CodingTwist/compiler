// Renders a chain link as the command text that follows `execute`.
import { Range } from "../../ir/node";
import { VersionProfile } from "../../../versions/profile";
import { Selector } from "../../frontend/nodes/selector";
import { toCommandValue } from "../../values/value";
import { renderExistence } from "../selector";
import { clause } from "../execute/render";
import type { ChainLink } from "./links";

/** Full rendered fragment for one chain link, including its own leading keyword(s). */
export function linkText(link: ChainLink, version: VersionProfile, ns: string): string {
  if (link.kind === "entity") {
    return `${link.mode} entity ${renderExistence(link.selector, version)}`;
  }
  if (link.kind === "near") {
    return nearLinkText(link, version);
  }
  // The chain always ends in `run`, so entity tests can stop at the first match.
  return link.clauses.map((c) => clause(c, version, ns, true)).join(" ");
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
