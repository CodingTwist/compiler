// Gathers every tick function under the pack's own `<ns>:tick`.
import type { Datapack } from "helix";

/**
 * Moves every `minecraft:tick` function under the pack's own `<ns>:tick`.
 *
 * helix tags tick functions straight into `minecraft:tick`. Under twine the tick should be one list
 * you own, so the whole pack's tick cost is visible in one place.
 *
 * Safe to run again: call it before writing if you add tick functions after `create`.
 */
export function consolidateTick(dp: Datapack): void {
  const root = "tick";
  const members = [...(dp.tags.get("tick") ?? [])].filter(
    (name) => name !== root,
  );
  if (members.length === 0) return;
  for (const name of members) dp.untag(name, "tick");
  dp.tick((ctx) => {
    for (const name of members) ctx.call(dp.functionRef(name)!);
  });
}
