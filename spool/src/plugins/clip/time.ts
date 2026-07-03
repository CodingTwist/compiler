/**
 * Time units for clips. Minecraft's command scheduler counts in **ticks** (20 per
 * second), but animation timings read far better in seconds - so author in seconds
 * and let this convert at the boundary. `TICKS_PER_SECOND` is the compiler's
 * canonical constant; this is just the seconds→ticks sugar over it.
 */
import { TICKS_PER_SECOND } from "helix";

/**
 * Whole ticks for a duration in seconds (rounded to the nearest tick - the
 * scheduler's resolution). Use for `play`/delay values authored in seconds:
 *
 *   clip.play(ctx, secondsToTicks(2));   // play after 2 s
 */
export function secondsToTicks(seconds: number): number {
  return Math.round(seconds * TICKS_PER_SECOND);
}
