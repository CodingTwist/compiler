import { Datapack } from "helix";
import type { Block, FunctionRef, FunctionContext } from "helix";
import type { KitPlugin } from "../../plugin";
import { createRaycastState } from "./context";
import type { RaycastState } from "./context";
import { buildMarcher } from "./march";

/**
 * A reusable **block raycast**: the classic datapack ray that marches the local
 * forward axis (`^`) through air until it hits a block (or runs out of reach), then
 * runs a caller-supplied body at the hit position. It's pure command math - no
 * entities, no macros - and inlines into the consuming pack's own namespace under
 * `raycast/<name>`.
 *
 * The plugin is un-opinionated about *what* a hit means: you pass an `onHit`
 * callback (summon a marker, place a block, read the position - whatever), and an
 * optional `hitOn` filter so only certain blocks count as a hit. `grapple` is the
 * first consumer (its web anchor), but nothing here is grapple-specific.
 *
 * Split by concern: `context.ts` (the shared `raycast.work` state + load-init),
 * `march.ts` (the recursive marcher). This file is the public type + plugin.
 */
export interface RaycastOptions {
  /**
   * The marcher's function path suffix and step-slot name - registers
   * `raycast/<name>` and counts steps on `#<name>_steps`. Must be unique per pack;
   * pick a stable, feature-scoped name (e.g. `"grapple/web"`).
   */
  readonly name: string;
  /** Maximum reach, in **steps** (each step is `stepBlocks` along `^`). */
  readonly maxSteps: number;
  /** Stride per step along the line of sight, in blocks. Default `0.5`. */
  readonly stepBlocks?: number;
  /**
   * Restrict what counts as a hit (a block id, or a tag via `Block.tag("logs")`).
   * The ray still stops at the first non-air block; if that block doesn't match, `onHit`
   * simply doesn't fire (a clean miss). Default: any non-air block is a hit.
   */
  readonly hitOn?: Block;
  /**
   * What to do at the hit. Runs **positioned at the hit block** (and, with `hitOn`,
   * only when it matches), building commands into the marcher's on-hit branch.
   */
  onHit(ctx: FunctionContext): void;
}

export interface RaycastRef {
  /** `raycast/<name>` - the raw marcher function, to `ctx.call` yourself if you seed steps by hand. */
  readonly cast: FunctionRef;
  /**
   * Fire the ray from the current run context: seed the reach budget and start the
   * march. **Must run from an already-positioned/anchored context** (the caller owns
   * the origin + facing), e.g. `execute at @s anchored eyes positioned ^ ^ ^ run ...`.
   */
  fire(ctx: FunctionContext): void;
}

/** The per-`Datapack` shared raycast state (the `raycast.work` objective + load-init), built once. */
const state = new WeakMap<Datapack, RaycastState>();

function raycastState(dp: Datapack): RaycastState {
  let s = state.get(dp);
  if (!s) {
    s = createRaycastState(dp);
    state.set(dp, s);
  }
  return s;
}

function defineRaycast(dp: Datapack, opts: RaycastOptions): RaycastRef {
  const s = raycastState(dp);
  const fn = dp.createFunction(`raycast/${opts.name}`);
  buildMarcher(s, fn, opts);

  const steps = s.steps(opts.name);
  return {
    cast: fn,
    fire(ctx: FunctionContext): void {
      ctx.scoreSet(steps.set(opts.maxSteps));
      ctx.call(fn);
    },
  };
}

declare module "helix" {
  interface Datapack {
    /**
     * Register a {@link RaycastRef}: a block raycast that marches `^` through air to
     * the first (optionally filtered) block and runs `onHit` there. Each call adds
     * its own `raycast/<name>` marcher; the shared `raycast.work` objective + its
     * `load`-init are created once. Not cached - call once per distinct ray.
     */
    raycast(opts: RaycastOptions): RaycastRef;
  }
}

export const raycast: KitPlugin = {
  name: "raycast",
  install() {
    Datapack.prototype.raycast = function (this: Datapack, opts: RaycastOptions): RaycastRef {
      return defineRaycast(this, opts);
    };
  },
};
