import { Selector, Range } from "helix";

/**
 * The grapple **selector library**: every `@s`/`@e[...]` query the plugin makes, named
 * once so the services read as intent (`selectors.grappling()`, `selectors.freshAnchor()`)
 * instead of re-spelling tag filters. Pure query builders - no state, no scoreboard.
 */
export function createSelectors() {
  return {
    /** The executing player/entity (`@s`). */
    self: () => Selector.self(),
    /** Every player currently swinging (`@a[tag=grappling]`) - the drive-tick loop's subjects. */
    grappling: () => Selector.allPlayers().tag("grappling"),
    /** Every anchor marker in the world (`@e[tag=grapple.anchor]`). */
    anchors: () => Selector.allEntities().tag("grapple.anchor"),
    /**
     * The anchor's transient per-summon handle (`grapple._new`, cleared at the end of
     * `start`, so it only ever matches the just-summoned marker).
     */
    freshAnchor: () => Selector.allEntities().tag("grapple._new"),
    /** {@link freshAnchor}, limited to one (for reading a single marker's position). */
    freshAnchorOne: () => Selector.allEntities().tag("grapple._new").limit(1),
    /**
     * The rope's per-tick aim target: the executing player's own anchor, transiently
     * tagged `grapple._aim` for the duration of one `drive` so `facing entity` and the
     * arrival check can name exactly it (drive runs per player, so only one is tagged).
     */
    aimTarget: () => Selector.allEntities().tag("grapple._aim").limit(1),
    /**
     * Same anchor, but only when the marcher has reached it (within one step), which
     * ends the particle line.
     */
    aimReached: () =>
      Selector.allEntities().tag("grapple._aim").distance(new Range(undefined, 0.6)).limit(1),
  };
}

/** The grapple selector library - whatever {@link createSelectors} returns. */
export type GrappleSelectors = ReturnType<typeof createSelectors>;
