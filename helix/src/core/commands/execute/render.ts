// Renders one `execute` clause, and says what it shares with and does to other lines.
import { VersionProfile } from "../../../versions/profile";
import { entityWriteEffect, pureClause, selectorClause, Effect, type SharedClause } from "../../ir/line-info";
import { Score } from "../../frontend/nodes/score";
import { Relation } from "../../values";
import { toCommandValue } from "../../values/value";
import { renderExistence } from "../selector";
import type { Clause } from "./types";

/** `c` as a clause other lines may share, given its rendered `text`. */
export function shared(c: Clause, text: string): SharedClause | undefined {
  switch (c.k) {
    case "as":
    case "at":
    case "positionedAs":
    case "rotatedAs":
    case "facingEntity":
      return selectorClause(text, c.sel.build(), c.k === "as");
    case "on":
      // Only a move, dismount or kill changes who rides `@s`.
      return c.relation === Relation.PASSENGERS
        ? { text, kind: "self", scans: false, forks: true }
        : { text, kind: "other", scans: false, forks: false };
    case "in":
    case "positioned":
    case "rotated":
    case "facing":
    case "anchored":
    case "align":
      return pureClause(text);
    // Conditions and stores belong to their own line. No `default`, so a new clause kind
    // must be decided here.
    case "scoreMatches":
    case "scoreCompare":
    case "entity":
    case "items":
    case "block":
    case "predicate":
    case "callFunction":
    case "storeScore":
    case "storeEntity":
    case "storeStorage":
    case "storeBossbar":
      return undefined;
  }
}

/** What `c` itself writes. */
export function effect(c: Clause): Effect {
  return c.k === "storeEntity" ? entityWriteEffect(c.path) : Effect.NONE;
}

function score(s: Score, v: VersionProfile): string {
  return `${toCommandValue(s.target).render(v)} ${s.objective.objective}`;
}

/** The command text of `c`. `existence` lets entity tests stop at the first match. */
export function clause(c: Clause, v: VersionProfile, ns: string, existence: boolean): string {
  switch (c.k) {
    case "as":
      return `as ${toCommandValue(c.sel).render(v)}`;
    case "at":
      return `at ${toCommandValue(c.sel).render(v)}`;
    case "in":
      return `in ${c.dim.render()}`;
    case "positioned":
      return `positioned ${toCommandValue(c.pos).render(v)}`;
    case "positionedAs":
      return `positioned as ${toCommandValue(c.sel).render(v)}`;
    case "rotated":
      return `rotated ${toCommandValue(c.rot).render(v)}`;
    case "rotatedAs":
      return `rotated as ${toCommandValue(c.sel).render(v)}`;
    case "facing":
      return `facing ${toCommandValue(c.pos).render(v)}`;
    case "facingEntity":
      return `facing entity ${toCommandValue(c.sel).render(v)} ${c.anchor}`;
    case "anchored":
      return `anchored ${c.anchor}`;
    case "on":
      return `on ${c.relation}`;
    case "align":
      return `align ${c.axes}`;
    case "scoreMatches":
      return `${c.mode} score ${score(c.score, v)} matches ${c.range}`;
    case "scoreCompare":
      return `${c.mode} score ${score(c.a, v)} ${c.op} ${score(c.b, v)}`;
    case "entity":
      return `${c.mode} entity ${
        existence ? renderExistence(c.sel, v) : toCommandValue(c.sel).render(v)
      }`;
    case "items":
      return `${c.mode} items entity ${toCommandValue(c.sel).render(v)} ${c.slot} ${c.item.render(v)}`;
    case "block":
      return `${c.mode} block ${toCommandValue(c.pos).render(v)} ${c.block.render(v)}`;
    case "predicate":
      return `${c.mode} predicate ${c.id}`;
    case "callFunction":
      return `${c.mode} function ${ns}:${c.fn.getName()}`;
    case "storeScore":
      return `store ${c.mode} score ${score(c.score, v)}`;
    case "storeEntity":
      return `store ${c.mode} entity ${toCommandValue(c.sel).render(v)} ${c.path.render()} ${c.type} ${c.scale}`;
    case "storeStorage":
      return `store ${c.mode} storage ${c.id.render()} ${c.path.render()} ${c.type} ${c.scale}`;
    case "storeBossbar":
      return `store ${c.mode} bossbar ${c.id.render()} ${c.field}`;
  }
}
