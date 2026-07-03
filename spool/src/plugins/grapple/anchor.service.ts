import { Pos } from "helix";
import type { FunctionContext } from "helix";
import type { GrappleConfig } from "./config";
import type { GrappleSelectors } from "./selectors";
import type { StateRepository } from "./state.repository";

interface AnchorDeps {
  config: GrappleConfig;
  selectors: GrappleSelectors;
  repo: StateRepository;
}

/**
 * The **anchor service**: what happens *at the block the web hits* - it's the `onHit`
 * payload handed to the `raycast` plugin. Summon the invisible marker there (the anchor a
 * leash can't be, so a position holder the rope + constraint reference by id) and read its
 * world position into the player's anchor scores. The block *filter* (`config.anchorOn`) is
 * the raycast's job now, so a disallowed block never calls this at all - hence the summon is
 * unconditional here.
 */
export function createAnchorService(d: AnchorDeps) {
  return {
    /**
     * Place the anchor at the current (hit) position and record it. Runs `at` the player
     * (the raycast preserves `@s`), so `repo.anchorVec()` writes into *this* player's anchor
     * scores.
     */
    place(ctx: FunctionContext): void {
      ctx.summon(d.config.anchorType, Pos.here(), d.config.anchorNbt());
      d.repo.readPos(ctx, d.selectors.freshAnchorOne(), d.repo.anchorVec().components);
    },
  };
}

/** The anchor-placement service - whatever {@link createAnchorService} returns. */
export type AnchorService = ReturnType<typeof createAnchorService>;
