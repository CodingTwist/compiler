import { Selector, Attribute } from "helix";
import type { FunctionContext } from "helix";
import { ZERO_GRAVITY, GRAVITY_MODIFIER_ID } from "./tuning";
import { releaseKick } from "./physics";
import type { PlayerMotion } from "../player_motion";
import { swingScratch } from "./state";
import type {
  Constants,
  GrappleSelectors,
  Scratch,
  StateRepository,
} from "./state";

interface ReleaseDeps {
  repo: StateRepository;
  consts: Constants;
  selectors: GrappleSelectors;
  motion: PlayerMotion;
  scratch: Scratch;
}

/**
 * Releases the rope: flings the player, removes the `grappling` tag, restores gravity, and
 * kills their anchor.
 */
export function createReleaseService(d: ReleaseDeps) {
  const scratch = swingScratch(d.scratch);

  return {
    /** Release the executing player. */
    release(ctx: FunctionContext): void {
      // Fling first, while the stored velocity is intact. `at @s` because `applyLocal`
      // needs the
      // player's position and rotation.
      ctx
        .execute()
        .at(d.selectors.self())
        .run((b) => releaseKick(d, scratch, b));

      ctx.tag().remove(d.selectors.self(), "grappling");
      // Restore gravity if we zeroed it on attach (exact restore - it's a removable modifier).
      if (ZERO_GRAVITY) {
        ctx
          .attribute()
          .modifierRemove(
            d.selectors.self(),
            Attribute.GRAVITY,
            GRAVITY_MODIFIER_ID,
          );
      }

      // Kill the anchor with this player's id. Removing the tag already stops the drive and
      // rope.
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
