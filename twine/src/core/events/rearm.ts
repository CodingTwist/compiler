// Re-arms a module's `once` handlers.
import type { Datapack, FunctionContext } from "helix";
import { EventLatches } from "./latches";
import { getEventHandlers } from "./register";

/**
 * Re-arms `once` handlers on `module` so they can fire again. Omit `methods` for all of them.
 *
 * Nothing re-arms by itself; the pack decides when (e.g. when a puzzle room is rebuilt).
 */
export function rearmEvents(
  ctx: FunctionContext,
  dp: Datapack,
  moduleName: string,
  instance: object,
  methods?: readonly string[],
): void {
  const latches = new EventLatches(dp);
  for (const h of getEventHandlers(instance)) {
    if (h.opts.once === false) continue;
    if (methods && !methods.includes(h.method)) continue;
    latches.score(moduleName, h.method).set(0);
  }
}
