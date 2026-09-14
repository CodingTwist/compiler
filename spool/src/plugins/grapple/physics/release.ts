// RELEASE: flings the player on let-go.
import { math } from "helix";
import type { FunctionContext } from "helix";
import type { SwingScratch } from "../state";
import type { PhysicsDeps } from "./types";

/**
 * Flings the player where they're looking on release, scaled by swing speed².
 *
 * Uses the velocity stored last tick, not pos − prev: drive has already overwritten `prev`
 * this
 * tick, so that would read zero. Capped at `RELEASE_KICK_MAX`. Must run at the player.
 */
export function releaseKick(d: PhysicsDeps, scratch: SwingScratch, ctx: FunctionContext): void {
  const consts = d.consts;

  // speed² = v·v of last tick's stored velocity. Not pos − prev, which drive has
  // overwritten.
  d.repo.velVec().lengthSquared(scratch.frac);

  // Local launch: forward (line of sight) = speed² · RELEASE_KICK, capped; no sideways / up.
  const launch = d.repo.launchVec();
  launch.x.set(0);
  launch.y.set(0);
  math`min(${scratch.frac} * ${consts.releaseKick}, ${consts.releaseKickMax})`.into(launch.z, ctx);
  d.motion.applyLocal(ctx);
}
