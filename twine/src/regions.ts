import type { FunctionContext } from "helix";
import { Pos, Selector } from "helix";
import type { AreaTrigger, Vec3, Zone } from "./area";

/** The zones of a geometric trigger. `score` and `players` triggers have none. */
export function triggerZones(trigger: AreaTrigger): Zone[] {
  switch (trigger.kind) {
    case "region":
      return [{ shape: "sphere", center: trigger.center, radius: trigger.radius }];
    case "cuboid":
      return [{ shape: "cuboid", from: trigger.from, to: trigger.to }];
    case "zones":
      return trigger.zones;
    case "score":
    case "players":
      return [];
  }
}

/**
 * Runs `body` for every player inside any of `zones`, one guarded line per zone.
 *
 * A player in overlapping zones runs `body` once per zone, so `body` must be idempotent.
 */
export function whenPlayerInZones(
  ctx: FunctionContext,
  zones: Zone[],
  body: (ctx: FunctionContext) => void,
): void {
  for (const zone of zones) {
    if (zone.shape === "sphere") {
      ctx.whenPlayerNear(Pos(...zone.center), zone.radius, body);
    } else {
      whenPlayerInBox(ctx, zone.from, zone.to, body);
    }
  }
}

/** Runs `body` guarded by `execute if entity @a[<box>]` for the box between two corners. */
function whenPlayerInBox(
  ctx: FunctionContext,
  from: Vec3,
  to: Vec3,
  body: (ctx: FunctionContext) => void,
): void {
  ctx.whenEntity(Selector.allPlayers().volume(from, to), body);
}
