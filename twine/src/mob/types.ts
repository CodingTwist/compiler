// The twine-side mob types: module options and the module handle.
import type { FunctionRef, Id } from "helix";
import type { MobOptions, MobPreview } from "spool/plugins/mob";
import type { ConfiguredModule } from "../core/module.interface";

/** Extra module metadata `toModule` passes straight through. */
export interface MobModuleOpts extends MobOptions {
  dimension?: Id;
}

/** A mob module plus handles to its generated functions. Read them after registration. */
export interface MobModuleRef extends ConfiguredModule {
  /** Summons the mob wherever it is run - `ctx.execute().at(...).run(b => b.call(mob.summon))`. */
  readonly summon: FunctionRef;
  /** `<name>/spawn`: summons one at the nearest player. */
  readonly spawn: FunctionRef;
  /** `<name>/on_tick`, the `onTick` body. Throws if there isn't one. */
  readonly onTickFn: FunctionRef;
  /** Each gesture's raise function, by name - call it *as* the mob. */
  readonly gestures: Record<string, FunctionRef>;
  /** Each state's enter function, by name - call it *as* the mob. */
  readonly states: Record<string, FunctionRef>;
  /** The model and gesture timelines as plain data - what `writeMobPreview` renders. */
  preview(): MobPreview;
}
