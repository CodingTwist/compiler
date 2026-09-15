// The rig plugin's public types: options and the handle.
import type { DamageType, DisplayValue, FunctionContext, FunctionRef, Selector, Transform } from "helix";

/** Creates and builds a function. */
export type RigFn = (name: string, body: (ctx: FunctionContext) => void) => FunctionRef;

/** Options for {@link rig}. */
export interface RigOptions {
  /** Prefix for the rig's tags and functions. The model's group is `<name>_rig`. */
  readonly name: string;
  readonly model: DisplayValue;
  /** Creates functions called from outside a caller's function tree, e.g. wrapped in a dimension. */
  readonly fn?: RigFn;
}

/** Damage a hit on the rig's hitbox does to the vehicle. */
export type Relay = { damage: number; type?: DamageType };

/** The handle {@link rig} returns. */
export interface Rig {
  /** Every rig's root member: the entity that actually rides. A new selector on each read. */
  readonly roots: Selector;
  /** Summons the model here and mounts it on `vehicle`, then runs `mounted` as the vehicle. */
  summonOn(ctx: FunctionContext, vehicle: () => Selector, mounted?: FunctionRef): void;
  /** Turns the executing vehicle's rig to its yaw. Pitch is never copied, since it tilts the model. */
  face(ctx: FunctionContext): void;
  /** Turns a hit on the executing vehicle's rig hitbox into damage on the vehicle. The model needs a hitbox. */
  relayHits(ctx: FunctionContext, relay: Relay): void;
  /** Marks every rig as orphaned; {@link claim} clears live ones before {@link sweep}. */
  markOrphans(ctx: FunctionContext): void;
  /** Clears the orphan mark on the executing vehicle's rig. */
  claim(ctx: FunctionContext): void;
  /** Kills every rig still marked orphaned. */
  sweep(ctx: FunctionContext): void;
  /**
   * Merges `pose(i)` onto each of `members`, interpolated over `duration` ticks.
   *
   * Run as the vehicle, or pass `self` to pick vehicles. Walks passengers so only that rig is touched.
   */
  pose(
    ctx: FunctionContext,
    self: Selector | undefined,
    members: readonly number[],
    pose: (i: number) => Transform,
    duration: number,
  ): void;
}
