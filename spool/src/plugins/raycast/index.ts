import { Datapack } from "helix";
import type { Block, FunctionRef, FunctionContext, Selector } from "helix";
import type { KitPlugin } from "../../plugin";
import { createRaycastState } from "./context";
import type { RaycastState } from "./context";
import { buildMarcher } from "./march";
import { createLookRay, type LookRay } from "./look";

export type { Ray, LookRay } from "./look";

/**
 * Options for a block raycast that marches `^` through air and runs `onHit` at the first
 * block.
 *
 * No entities or macros. You decide what a hit does; `hitOn` filters which blocks count.
 */
export interface RaycastOptions {
  /** Function path suffix and step-slot name (`raycast/<name>`). Must be unique per pack. */
  readonly name: string;
  /** Maximum reach, in steps of `stepBlocks`. */
  readonly maxSteps: number;
  /** Stride per step along the line of sight, in blocks. Default `0.5`. */
  readonly stepBlocks?: number;
  /**
   * Blocks that count as a hit (id or `Block.tag(...)`). Default: any non-air block.
   * The ray still stops at the first non-air block; a non-match is a miss.
   */
  readonly hitOn?: Block;
  /**
   * Entities that end the ray early and run {@link onReach} instead of {@link onHit}.
   *
   * Turns the ray into a line-of-sight check. Give it `distance` slack, since the ray
   * samples every
   * `stepBlocks` and `distance` measures to feet.
   */
  readonly stopAt?: Selector;
  /**
   * Runs where {@link stopAt} matched. Ending it with `ctx.return_(1)` makes the whole ray
   * return 1,
   * so `execute if function <ref>.cast` is a line-of-sight test.
   */
  onReach?(ctx: FunctionContext): void;
  /**
   * Runs at the hit block (only matching blocks with `hitOn`). Optional for pure
   * line-of-sight rays.
   */
  onHit?(ctx: FunctionContext): void;
}

export interface RaycastRef {
  /** `raycast/<name>` - the raw marcher function, to `ctx.call` yourself if you seed steps by hand. */
  readonly cast: FunctionRef;
  /**
   * Fires the ray from the current context. The caller must set position and facing,
   * e.g. `execute at @s anchored eyes positioned ^ ^ ^ run ...`.
   */
  fire(ctx: FunctionContext): void;
}

/** The per-`Datapack` shared raycast state (the `raycast.work` objective + load-init), built once. */
const state = new WeakMap<Datapack, RaycastState>();

function raycastState(dp: Datapack): RaycastState {
  let s = state.get(dp.root);
  if (!s) {
    s = createRaycastState(dp.root.plugin("raycast"));
    state.set(dp.root, s);
  }
  return s;
}

const lookRays = new WeakMap<Datapack, LookRay>();

function defineRaycast(dp: Datapack, opts: RaycastOptions): RaycastRef {
  const s = raycastState(dp);
  const fn = dp.createFunction(opts.name);
  // Keyed by group too, so same-named rays in two groups keep separate budgets.
  const steps = s.steps(dp.path ? `${dp.path}/${opts.name}` : opts.name);
  buildMarcher(dp, fn, steps, opts);

  return {
    cast: fn,
    fire(ctx: FunctionContext): void {
      steps.set(opts.maxSteps);
      ctx.call(fn);
    },
  };
}

declare module "helix" {
  interface Datapack {
    /** Registers a block raycast as `<name>` in this group. Not cached; call once per ray. */
    raycast(opts: RaycastOptions): RaycastRef;
    /** The pack's shared {@link LookRay}, for math hit tests like `rb.raycast`. */
    lookRay(): LookRay;
  }
}

export const raycast: KitPlugin = {
  name: "raycast",
  install() {
    Datapack.prototype.raycast = function (
      this: Datapack,
      opts: RaycastOptions,
    ): RaycastRef {
      return defineRaycast(this, opts);
    };
    Datapack.prototype.lookRay = function (this: Datapack): LookRay {
      let ray = lookRays.get(this.root);
      if (!ray)
        lookRays.set(this.root, (ray = createLookRay(raycastState(this))));
      return ray;
    };
  },
};
