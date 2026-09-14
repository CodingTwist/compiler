// Places the anchor marker where the web hits.
import { Pos, Range } from "helix";
import type { FunctionContext } from "helix";
import type { GrappleConfig } from "./config";
import type { GrappleSelectors } from "./selectors";
import type { StateRepository } from "./repository";

interface AnchorDeps {
  config: GrappleConfig;
  selectors: GrappleSelectors;
  repo: StateRepository;
}

/**
 * Runs at the block the web hits: summons the anchor marker and stores its position.
 * Block filtering happens in the raycast, so this always summons.
 */
export function createAnchorService(d: AnchorDeps) {
  return {
    /** Places the anchor here and records it in this player's scores. */
    place(ctx: FunctionContext): void {
      ctx.summon(d.config.anchorType, Pos.here(), d.config.anchorNbt());
      // Just summoned here, so `..1` keeps the scan to nearby chunks.
      d.repo.readPos(ctx, d.selectors.freshAnchorOne().distance(Range.atMost(1)), d.repo.anchorVec());
    },
  };
}

/** The anchor-placement service - whatever {@link createAnchorService} returns. */
export type AnchorService = ReturnType<typeof createAnchorService>;
