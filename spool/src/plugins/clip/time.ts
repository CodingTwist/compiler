/** Seconds-to-ticks conversion for clips. */
import { TICKS_PER_SECOND } from "helix";

/**
 * Whole ticks for `seconds`, rounded.
 *
 *   clip.play(ctx, secondsToTicks(2));   // play after 2 s
 */
export function secondsToTicks(seconds: number): number {
  return Math.round(seconds * TICKS_PER_SECOND);
}
