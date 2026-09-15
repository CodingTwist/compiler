import type { Relay } from "../../rig";
import type { DisplayValue, FunctionContext, FunctionRef, IdentifiedEntityNbt } from "helix";
import type { MobDifficulty, MobState, MobTick } from "../types";
import type { ResolvedGesture } from "../gesture";

export type { Relay };

/** Creates and builds a function; see {@link Mob.register}. */
export type MobFn = (name: string, body: (ctx: FunctionContext) => void) => FunctionRef;



/** Everything a {@link MobBuilder} collected, handed to the {@link Mob} it builds. */
export interface MobDef<S extends string> {
  name: string;
  nbt: IdentifiedEntityNbt;
  model: DisplayValue;
  tickEvery: number;
  wakeRange: number;
  relay?: Relay;
  gestures: ResolvedGesture<S>[];
  tick?: MobTick<S>;
  states: ReadonlyMap<string, MobState<S>>;
  /** Run as each mob at summon and whenever the pack's difficulty changes. */
  onDifficulty?: MobDifficulty;
}
