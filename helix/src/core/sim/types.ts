// Shapes shared across the simulator.
import type { Compound } from "./nbt";
import type { Sim } from "./sim";

export type V3 = [number, number, number];

/** A simulated entity. Its position is `nbt.Pos`, so `data` commands move it. */
export interface SimEntity {
  readonly uuid: string;
  readonly type: string;
  readonly tags: Set<string>;
  readonly nbt: Compound;
}

/** Who runs a command and where: `execute as` / `at` / `positioned` change it. */
export interface SimSource {
  readonly sim: Sim;
  readonly self: SimEntity | null;
  readonly at: V3;
  /** Yaw and pitch in degrees, for `^` coordinates: set by `execute at`. */
  readonly rot?: readonly [number, number];
  /** Whether `^` coordinates start at the eyes: `execute anchored eyes`. */
  readonly eyes?: boolean;
}
