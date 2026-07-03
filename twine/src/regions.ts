import type { FunctionContext } from "helix";
import { Pos, Selector } from "helix";
import type { AreaTrigger, Vec3, Zone } from "./area";

/**
 * Flatten a presence-style trigger to the list of zones a player can be inside.
 * `score` triggers aren't presence-based, so they yield no zones (the factory
 * handles them separately as a latch).
 */
export function triggerZones(trigger: AreaTrigger): Zone[] {
  switch (trigger.kind) {
    case "region":
      return [{ shape: "sphere", center: trigger.center, radius: trigger.radius }];
    case "cuboid":
      return [{ shape: "cuboid", from: trigger.from, to: trigger.to }];
    case "zones":
      return trigger.zones;
    case "score":
      return [];
  }
}

/**
 * Run `body` for every player inside the union of `zones`. Each zone emits one
 * guarded line - a sphere via `whenPlayerNear`, a cuboid via a volume `Selector`
 * fed to `whenEntity`. A player inside several overlapping zones triggers `body`
 * once per zone, so `body` must be idempotent (a flag set or a function call -
 * the only two things the factory passes - both are).
 *
 * Both paths go through the compiler's public API; this layer never builds IR
 * nodes or selector strings itself.
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

/**
 * Emit `body`'s commands each guarded by `execute if entity @a[<box>] run …`,
 * using the `Selector.volume` builder + `ctx.whenEntity` capture API. The
 * selector matches any player whose hitbox overlaps the axis-aligned box between
 * the two corners (order-independent).
 */
function whenPlayerInBox(
  ctx: FunctionContext,
  from: Vec3,
  to: Vec3,
  body: (ctx: FunctionContext) => void,
): void {
  ctx.whenEntity(Selector.allPlayers().volume(from, to), body);
}
