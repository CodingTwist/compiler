import { ResourceId } from "./resource";
import { withMembers } from "./members";
import { SOUND_EVENT_IDS } from "../../versions/data/ids";

/**
 * A sound event id, e.g. `SoundEvent.AMBIENT_CAVE`.
 *
 *   SoundEvent.AMBIENT_CAVE          -> "minecraft:ambient.cave"
 *   SoundEvent("mypack:custom_hum")  -> "mypack:custom_hum"
 *
 * HAND-WRITTEN because no command argument uses `sound_event`, so the generator skips it.
 * Landmine: if one ever does, `gen:commands` will generate a duplicate `SoundEvent`; delete
 * this file then.
 */
export type SoundEvent = ResourceId<"minecraft:sound_event">;
export const SoundEvent = withMembers(
  (id: string): SoundEvent => new ResourceId(id, "minecraft:sound_event"),
  SOUND_EVENT_IDS,
  (id) => new ResourceId(id, "minecraft:sound_event"),
);
