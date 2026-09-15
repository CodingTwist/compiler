import type { Id } from "../../id";
import type { BlockValue } from "../../block";
import type { Bound, IdList } from "./common";

/** A fluid check: ids or a tag, plus state values. */
export interface FluidSpec {
  fluids?: IdList;
  state?: Record<string, Bound | boolean | string>;
}

/** Location facts an `EntityPredicate.location` / `location_check` can assert. */
export interface LocationSpec {
  /** Biome id, tag or list, e.g. `Biome.PLAINS`. Tags and lists need 1.20.5+. */
  biome?: IdList;
  /** Dimension id, e.g. `"minecraft:the_nether"`. */
  dimension?: string | Id;
  /** Structure id, tag or list. Tags and lists need 1.20.5+. */
  structure?: IdList;
  /** The block at the location: id or tag, plus state and block-entity data. */
  block?: string | BlockValue;
  /** The fluid at the location. */
  fluid?: FluidSpec;
  /** Light level, `max(sky, block)`. */
  light?: Bound;
  /** Within 5 blocks above a campfire. 1.16+. */
  smokey?: boolean;
  /** Full sky light. 1.21+. */
  canSeeSky?: boolean;
  /** Coordinate bounds (`x`/`y`/`z`). */
  position?: { x?: Bound; y?: Bound; z?: Bound };
}
