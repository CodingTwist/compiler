// An area's activation check: score/players polls, or location advancements.
import { Pos, privateName, Range, Selector, Trigger } from "helix";
import type { FunctionContext, Id, Score } from "helix";
import type { ModuleRef } from "../module.interface";
import type { Zone } from "../area";
import { triggerZones } from "../regions";
import type { Wiring } from "./types";
import { emitPresence } from "./presence";
import { scoreOf, scoreRange } from "./score";

/**
 * The area's activation check, only while `active == 0`.
 *
 * - Geometric triggers activate when a player enters any zone; see {@link emitPresence} for
 * leaving.
 * - `score` triggers activate when the score matches, and latch unless `latch: false`.
 */
export function emitArm(
  w: Wiring,
  ref: ModuleRef,
  ctx: FunctionContext,
  dim: Id | undefined,
  gates: Score[],
): void {
  const { meta } = w.graph.nodes.get(ref)!;
  const trigger = meta.trigger!;
  const activate = w.activateOf.get(ref)!;
  if (trigger.kind !== "score" && trigger.kind !== "players") {
    armByAdvancement(w, ref, triggerZones(trigger), dim, gates);
    return;
  }
  ctx.if(w.flags.score(meta.name).equal(0), (off) => {
    if (trigger.kind === "score") {
      off.if(scoreOf(w, trigger).matches(scoreRange(trigger)), (hit) =>
        hit.call(activate),
      );
    } else if (trigger.kind === "players") {
      off.whenEntity(trigger.selector, (any) => any.call(activate));
    }
  });
}

/**
 * Arms a geometric area with `minecraft:location` advancements, so a dormant area costs nothing per
 * tick.
 *
 * Vanilla checks `location` about once a second, so entry can lag up to 1s, and it tests the
 * player's feet. Leaving can't be a trigger, so {@link emitPresence} still polls.
 */
function armByAdvancement(
  w: Wiring,
  ref: ModuleRef,
  zones: Zone[],
  dim: Id | undefined,
  gates: Score[],
): void {
  const { meta } = w.graph.nodes.get(ref)!;
  const activate = w.activateOf.get(ref)!;
  const self = w.flags.score(meta.name);
  zones.forEach((zone, i) => {
    const name = privateName(`${meta.name}/enter_${i}`);
    if (w.dp.functionRef(name)) return; // area reached from a second parent: already armed
    const [from, to] =
      zone.shape === "sphere"
        ? [
            zone.center.map((c) => c - zone.radius),
            zone.center.map((c) => c + zone.radius),
          ]
        : [zone.from, zone.to];
    // Cuboid corners are inclusive blocks, so the box runs to the far block's far face.
    const far = zone.shape === "sphere" ? 0 : 1;
    const axis = (k: number) => ({
      min: Math.min(from[k], to[k]),
      max: Math.max(from[k], to[k]) + far,
    });
    const trigger = Trigger.location({
      ...(dim ? { dimension: dim } : {}),
      position: { x: axis(0), y: axis(1), z: axis(2) },
    });
    w.dp.event(name, trigger, (ctx) => {
      const chain = ctx.execute();
      for (const gate of gates) chain.ifScoreMatches(gate, Range.exactly(1));
      chain.ifScoreMatches(self, Range.exactly(0));
      if (zone.shape === "sphere") {
        chain
          .positioned(Pos(...zone.center))
          .ifEntity(Selector.self().distance(Range.atMost(zone.radius)));
      }
      chain.run((hit) => hit.call(activate));
    });
  });
}
