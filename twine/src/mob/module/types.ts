import type { DamageType, DisplayValue, IdentifiedEntityNbt } from "helix";
import type { MobDifficulty, MobState, MobTick } from "../types";
import type { ResolvedGesture } from "../gesture";

export type Relay = { damage: number; type?: DamageType };

/** Everything a {@link MobBuilder} collected, handed to the module it compiles to. */
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
