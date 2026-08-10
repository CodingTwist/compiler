import { Selector, Attribute } from "helix";
import type { FunctionContext } from "helix";
import { DEBUG, ZERO_GRAVITY, GRAVITY_MODIFIER_ID } from "./tuning";
import { fixRopeLength } from "./physics";
import { swingScratch } from "./state";
import type { Constants, GrappleSelectors, Scratch, StateRepository } from "./state";

interface AttachDeps {
  repo: StateRepository;
  consts: Constants;
  selectors: GrappleSelectors;
  scratch: Scratch;
}

/**
 * The **attach service**: latch a player onto an anchor that was just placed. This is the
 * body the controller runs, gated on the fresh anchor existing (a fizzled/filtered raycast
 * summons nothing, so this never runs and the player stays un-tagged with no stale rope).
 *
 * It fixes the swing radius (the same vector maths a drive tick measures distance with, via
 * `physics.fixRopeLength`), stamps a fresh shared id on the player + their anchor so `stop`
 * and the per-tick rope can name exactly this pair by scoreboard compare, tags the player
 * `grappling`, and (when `ZERO_GRAVITY`) zeroes gravity with a removable modifier so the
 * swing is a momentum orbit. The raycast + anchor placement are separate services.
 */
export function createAttachService(d: AttachDeps) {
  const scratch = swingScratch(d.scratch);

  return {
    /** Latch the executing player onto the fresh anchor. Runs as + at the player. */
    latch(ctx: FunctionContext): void {
      // Fix the swing radius = current distance² to the anchor, seeding prev-pos.
      d.repo.readPos(ctx, d.selectors.self(), scratch.pos);
      fixRopeLength(d, scratch);

      // Stamp a fresh shared id on the player and its anchor.
      ctx.scoreAdd(d.consts.nextId.add(1));
      d.repo.id.score(d.selectors.self()).assign(d.consts.nextId);
      ctx
        .execute()
        .as(d.selectors.freshAnchor())
        .run((a) => d.repo.id.score(Selector.self()).assign(d.consts.nextId, a));

      // Tag the player swinging, then drop the transient summon handle (it only ever matched
      // this anchor). The visible rope is drawn each tick by the swing service.
      ctx.tag().add(d.selectors.self(), "grappling");
      // Zero gravity while swinging (removed in `grapple/stop`): kills the bounce's energy
      // source and turns the swing into a momentum orbit. See `tuning.ts`.
      if (ZERO_GRAVITY) {
        ctx.attribute().modifierAddAddMultipliedTotal(
          d.selectors.self(), Attribute.GRAVITY, GRAVITY_MODIFIER_ID, -1,
        );
      }
      ctx.tag().remove(d.selectors.freshAnchor(), "grapple._new");

      if (DEBUG) {
        ctx.tellraw(d.selectors.self(), "[grapple] hooked - swinging (watch the action bar)");
      }
    },
  };
}

/** The attach (latch) service - whatever {@link createAttachService} returns. */
export type AttachService = ReturnType<typeof createAttachService>;
