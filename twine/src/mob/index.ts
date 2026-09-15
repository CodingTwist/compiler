// Custom mobs as twine modules: `defineMob(nbt, model).toModule(name)`. The mob itself is
// spool's `mob` plugin; `writeMobPreview` renders its rig and gestures to an HTML page.
import { writeMobPreview as writePreview, type MobPreviewOpts } from "spool/plugins/mob";
import type { MobModuleRef } from "./types";

export { defineMob, MobBuilder } from "./builder";
export type { MobModuleOpts, MobModuleRef } from "./types";
export type { MobPreview, MobPreviewOpts, MobStates } from "spool/plugins/mob";

/** Writes an HTML page that renders a mob module's rig and plays its gestures. */
export function writeMobPreview(file: string, mob: MobModuleRef, opts: MobPreviewOpts = {}): void {
  writePreview(file, { name: mob.metadata.name, preview: () => mob.preview() }, opts);
}
