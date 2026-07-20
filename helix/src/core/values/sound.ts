import { ResourceId } from "./resource";
import { withMembers } from "./members";
import { SOUND_EVENT_IDS } from "../../versions/data/ids";

/**
 * A **sound event** id (`minecraft:sound_event`) - the branded resource type a
 * biome's ambient / mood / additions / music sound accepts, so
 * `SoundEvent.AMBIENT_CAVE` autocompletes and a typo fails to compile where a
 * bare `"ambient.cave"` never would.
 *
 *   SoundEvent.AMBIENT_CAVE          -> "minecraft:ambient.cave"
 *   SoundEvent("mypack:custom_hum")  -> "mypack:custom_hum"
 *
 * This one is HAND-WRITTEN rather than emitted into `resource.generated.ts`,
 * because that file only covers registries referenced by a *command argument*
 * and no command takes a `sound_event` (the sound commands use a plain
 * resource_location). The member set still comes from the same generated
 * `SOUND_EVENT_IDS` map as every other concept registry (see
 * scripts/concept-registries.mjs).
 *
 * **Landmine:** if a future version's command tree ever references
 * `minecraft:sound_event` in an argument, `gen:commands` will emit a second
 * `SoundEvent` into `resource.generated.ts` and the values barrel's `export *`
 * will collide - delete this file at that point.
 */
export type SoundEvent = ResourceId<"minecraft:sound_event">;
export const SoundEvent = withMembers(
  (id: string): SoundEvent => new ResourceId(id, "minecraft:sound_event"),
  SOUND_EVENT_IDS,
  (id) => new ResourceId(id, "minecraft:sound_event"),
);
