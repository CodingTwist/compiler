// The named selectors grapple services use.
import { Range, Selector } from "helix";
import { ANCHOR_TYPE } from "../tuning";

/** Every selector the plugin uses, named so services read as intent. */
export function createSelectors() {
  return {
    /** The executing player/entity (`@s`). */
    self: () => Selector.self(),
    /** Every player currently swinging (`@a[tag=grappling]`) - the drive-tick loop's subjects. */
    grappling: () => Selector.allPlayers().tag("grappling"),
    /** Every anchor marker in the world (`@e[tag=grapple.anchor]`). */
    anchors: () =>
      Selector.allEntities().type(ANCHOR_TYPE).tag("grapple.anchor"),
    /** The just-summoned anchor. The tag is cleared at the end of `start`. */
    freshAnchor: () =>
      Selector.allEntities().type(ANCHOR_TYPE).tag("grapple._new"),
    /** {@link freshAnchor}, limited to one (for reading a single marker's position). */
    freshAnchorOne: () =>
      Selector.allEntities().type(ANCHOR_TYPE).tag("grapple._new").limit(1),
    /**
     * This player's anchor, tagged for the length of one `drive` so the rope can aim at it.
     */
    aimTarget: () =>
      Selector.allEntities().type(ANCHOR_TYPE).tag("grapple._aim").limit(1),
    /**
     * Same anchor, but only when the marcher has reached it (within one step), which
     * ends the particle line.
     */
    aimReached: () =>
      Selector.allEntities()
        .type(ANCHOR_TYPE)
        .tag("grapple._aim")
        .distance(new Range(undefined, 0.6))
        .limit(1),
  };
}

/** The grapple selector library - whatever {@link createSelectors} returns. */
export type GrappleSelectors = ReturnType<typeof createSelectors>;
