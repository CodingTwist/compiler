// A ray held in scores: where an entity looks from and which way, for math-based hit tests.
import { EntityAnchor, Marker, Path, Pos, Selector, math } from "helix";
import type { FunctionContext, ScoreVec3 } from "helix";
import type { RaycastState } from "./context";

/** A ray in scores: origin (mm) and direction (length 1000). */
export interface Ray {
  readonly origin: ScoreVec3;
  readonly dir: ScoreVec3;
}

/** A {@link Ray} that `fill` points along the executing entity's line of sight. */
export interface LookRay extends Ray {
  /** Writes the executing entity's eye position and look direction into the ray. Run as and at it. */
  fill(ctx: FunctionContext): void;
}

const PROBE_UUID_INTS: [number, number, number, number] = [0x7261, 0, 0, 1];
const probe = () => Selector.uuid("7261-0-0-0-1");

/** Builds the pack's look ray on the `raycast.work` objective. */
export function createLookRay(s: RaycastState): LookRay {
  const origin = s.vector("look_o");
  const dir = s.vector("look_d");
  const ahead = s.vector("look_a");
  return {
    origin,
    dir,
    fill(ctx) {
      // Summoned per fill and killed after, so a stale probe in an unloaded chunk can't block it.
      ctx.execute().anchored(EntityAnchor.EYES).positioned(Pos.local(0, 0, 0)).run((b) => b.summon(Marker({ uuid: PROBE_UUID_INTS })));
      origin.readEntity(probe(), Path.Entity.Pos, 1000, { ctx });
      ctx.execute().anchored(EntityAnchor.EYES).positioned(Pos.local(0, 0, 1)).run((b) => b.teleport(probe(), Pos.here()));
      ahead.readEntity(probe(), Path.Entity.Pos, 1000, { ctx });
      ctx.kill(probe());
      math`${ahead} - ${origin}`.into(dir, ctx);
    },
  };
}
