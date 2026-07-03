import { Selector, Attribute } from "helix";
import type { FunctionContext } from "helix";
import { ZERO_GRAVITY, GRAVITY_MODIFIER_ID } from "./tuning";
import { releaseKick } from "./physics";
import { swingScratch } from "./scratch";
import type { Scratch } from "./scratch";
import type { StateRepository } from "./state.repository";
import type { Constants } from "./constants";
import type { GrappleSelectors } from "./selectors";
import type { PlayerMotion } from "../player_motion";

interface ReleaseDeps {
  repo: StateRepository;
  consts: Constants;
  selectors: GrappleSelectors;
  motion: PlayerMotion;
  scratch: Scratch;
}

/**
 * The **release service**: let go of the rope. Flings the player along their line of sight
 * (`physics.releaseKick`, scaled by swing speed²) so releasing launches them instead of
 * stalling against air drag, then tears down the swing: drop the `grappling` tag, restore
 * gravity (remove the modifier attach added), and kill *this* player's anchor marker
 * (matched by the shared id). The fling runs first, while the player's stored velocity is
 * still intact.
 */
export function createReleaseService(d: ReleaseDeps) {
  const scratch = swingScratch(d.scratch);

  return {
    /** Release the executing player. */
    release(ctx: FunctionContext): void {
      // Fling on release, before dropping the tag / killing the anchor: the kick reads the
      // player's stored swing velocity, which those don't touch. Runs `at @s` for the
      // position/rotation context `applyLocal` needs - `stop`'s callers don't all provide it.
      ctx.execute().at(d.selectors.self()).run((b) => releaseKick(d, scratch, b));

      ctx.tag().remove(d.selectors.self(), "grappling");
      // Restore gravity if we zeroed it on attach (exact restore - it's a removable modifier).
      if (ZERO_GRAVITY) {
        ctx.attribute().modifierRemove(d.selectors.self(), Attribute.GRAVITY, GRAVITY_MODIFIER_ID);
      }

      // Release this player's anchor: stage their id, then kill the anchor marker that shares
      // it. Dropping the tag already stops drive (and the rope) for them.
      const stopId = d.scratch.scalar("stop_id");
      stopId.assign(d.repo.id.score(d.selectors.self()));
      ctx
        .execute()
        .as(d.selectors.anchors())
        .ifScore(d.repo.id.score(Selector.self()), "=", stopId)
        .run((b) => b.kill(Selector.self()));
    },
  };
}

/** The release service - whatever {@link createReleaseService} returns. */
export type ReleaseService = ReturnType<typeof createReleaseService>;
