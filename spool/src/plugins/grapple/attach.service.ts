import { Selector, Attribute } from "helix";
import type { FunctionContext } from "helix";
import { DEBUG, ZERO_GRAVITY, GRAVITY_MODIFIER_ID } from "./tuning";
import { fixRopeLength } from "./physics";
import { swingScratch } from "./state";
import type {
  Constants,
  GrappleSelectors,
  Scratch,
  StateRepository,
} from "./state";

interface AttachDeps {
  repo: StateRepository;
  consts: Constants;
  selectors: GrappleSelectors;
  scratch: Scratch;
}

/**
 * Latches a player onto a freshly placed anchor.
 *
 * Only runs if the anchor exists, so a missed raycast leaves no stale rope. Fixes the rope
 * length,
 * gives the player and anchor a shared id, and tags the player `grappling`.
 */
export function createAttachService(d: AttachDeps) {
  const scratch = swingScratch(d.scratch);

  return {
    /** Latches the executing player onto the fresh anchor. Run as and at the player. */
    latch(ctx: FunctionContext): void {
      // Fix the swing radius = current distance² to the anchor, seeding prev-pos.
      d.repo.readPos(ctx, d.selectors.self(), scratch.pos);
      fixRopeLength(d, scratch);

      // Stamp a fresh shared id on the player and its anchor.
      d.consts.nextId.add(1);
      d.repo.id.score(d.selectors.self()).assign(d.consts.nextId);
      ctx
        .execute()
        .as(d.selectors.freshAnchor())
        .run((a) =>
          d.repo.id.score(Selector.self()).assign(d.consts.nextId, a),
        );

      // Tag the player, then clear the temporary summon tag. The swing service draws the
      // rope.
      ctx.tag().add(d.selectors.self(), "grappling");
      // Zero gravity while swinging (removed in `grapple/stop`). See `tuning.ts`.
      if (ZERO_GRAVITY) {
        ctx
          .attribute()
          .modifierAddAddMultipliedTotal(
            d.selectors.self(),
            Attribute.GRAVITY,
            GRAVITY_MODIFIER_ID,
            -1,
          );
      }
      ctx.tag().remove(d.selectors.freshAnchor(), "grapple._new");

      if (DEBUG) {
        ctx.tellraw(
          d.selectors.self(),
          "[grapple] hooked - swinging (watch the action bar)",
        );
      }
    },
  };
}

/** The attach (latch) service - whatever {@link createAttachService} returns. */
export type AttachService = ReturnType<typeof createAttachService>;
