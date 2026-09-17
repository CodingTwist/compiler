// The limb plugin's public types: options and the handle.
import type { Block, FunctionContext, FunctionRef } from "helix";

/** A point in the body's frame, like `^left ^up ^forward`, in blocks. */
export type Local = readonly [number, number, number];

/** One leg: where it joins the body, where its foot rests, and which half of the gait it steps in. */
export interface Leg {
  readonly hip: Local;
  /** Where the foot rests. Only x and z count; y is found on the ground. */
  readonly rest: Local;
  /** Legs step only while no leg of the other group is stepping. */
  readonly group: 0 | 1;
}

/** Options for {@link limb}. */
export interface LimbOptions {
  /** Prefix for the limb's tags, objectives and storage. */
  readonly name: string;
  readonly legs: readonly Leg[];
  /** Bone lengths from hip to foot, in blocks. The same for every leg. */
  readonly bones: readonly number[];
  readonly block: Block;
  /** Bone width in blocks. Default `0.08`. */
  readonly thickness?: number;
  /** How far above the hip-foot line the knees start each solve. Bends them up. Default `0.8`. */
  readonly knee?: number;
  /** How far a foot may drift from its rest point before it steps. Default `0.9`. */
  readonly stride?: number;
  /** How far past its rest point a foot lands, along its drift, in blocks. Default: the stride. */
  readonly overshoot?: number;
  /** Polls a step takes. Default `3`. */
  readonly stepPolls?: number;
  /** How high a foot lifts mid-step. Default `0.4`. */
  readonly lift?: number;
  /** FABRIK passes per poll, about 30 commands each for a two-bone leg. Default `2`. */
  readonly iterations?: number;
  /**
   * Height of the rig's seat above the body's feet, where the bones are drawn from. Tune per
   * mob, like the rig's own offset.
   */
  readonly mountY?: number;
}

/** The handle {@link limb} returns. */
export interface Limb {
  /** Steps and solves every leg of the executing body, into storage. No `on`, so the simulator runs it. */
  readonly update: FunctionRef;
  /** Summons the bones onto the body's rig on first use, then draws them from what {@link update} solved. */
  readonly pose: FunctionRef;
  /** Update then pose, as and at the body. Run every poll, before the rig's `face`. */
  tick(ctx: FunctionContext): void;
}
