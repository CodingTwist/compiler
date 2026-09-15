import { Datapack } from "helix";
import type { FunctionRef, Score, FunctionContext } from "helix";
import type { KitPlugin } from "../../plugin";
import { createInternals } from "./context";
import { defineInit } from "./init";
import { defineStore } from "./store";
import { defineLaunch } from "./launch";
import { defineMath } from "./math";
import { defineApi } from "./api";

/**
 * A typed port of the `player_motion` datapack
 * (https://github.com/MulverineX/player_motion).
 *
 * Launches a player by applying an `apply_impulse` enchantment on a dummy saddle, with the
 * velocity split into per-bit scores.
 *
 * Only the modern API, without macros. The macro-based upstream paths (large vectors,
 * mismatched context, polar rotation, deprecated functions) aren't ported and `return
 * fail`.
 * Everything is inlined into the consuming pack's namespace.
 */
/** A velocity relative to the player's facing, in blocks/tick. Missing axes are 0. */
export interface LocalVelocity {
  /** Strafe: right (+) / left (-). */
  readonly sideways?: number;
  /** Vertical: up (+) / down (-). */
  readonly up?: number;
  /** Along the line of sight: forward (+) / backward (-). */
  readonly forward?: number;
}

/** A velocity along world axes, in blocks/tick. Used by {@link PlayerMotion.launchGlobal}. */
export interface GlobalVelocity {
  readonly x?: number;
  readonly y?: number;
  readonly z?: number;
}

export interface PlayerMotion {
  /** Launches the executing player relative to their facing. Run as and at the player. */
  launchLocal(ctx: FunctionContext, velocity: LocalVelocity): void;
  /**
   * Launches the executing player along world axes. Run at the player.
   * Values beyond ±12398 per axis aren't supported and `return fail`.
   */
  launchGlobal(ctx: FunctionContext, velocity: GlobalVelocity): void;

  /**
   * Like {@link launchLocal}, but for a per-tick sustained push (thrust, grapple, swing).
   *
   * Skips the gamemode swap, so the player must already be moving; start from standstill
   * with
   * {@link launchLocal}. Omit `velocity` to use what's already in {@link launchInput}.
   */
  applyLocal(ctx: FunctionContext, velocity?: LocalVelocity): void;
  /**
   * Like {@link launchGlobal}, but sustained per tick. See {@link applyLocal}.
   *
   * Past ±12398 it fails before clearing the sustain flag, which can leak into the next
   * launch.
   * Not an issue at per-tick speeds.
   */
  applyGlobal(ctx: FunctionContext, velocity?: GlobalVelocity): void;

  // --- Lower-level handles (for manual control / cross-referencing) -----------
  /** `api/launch_local_xyz` - the raw function, to `ctx.call` yourself after setting {@link launchInput}. */
  readonly launchLocalXyz: FunctionRef;
  /** `api/launch_global_xyz` - the raw function, to `ctx.call` yourself after setting {@link launchInput}. */
  readonly launchGlobalXyz: FunctionRef;
  /**
   * The `$x/$y/$z player_motion.api.launch` input scores, in fixed-point (10000 = 1
   * block/tick).
   * Prefer {@link launchLocal} / {@link launchGlobal}, which convert for you.
   */
  readonly launchInput: {
    readonly x: Score;
    readonly y: Score;
    readonly z: Score;
  };
}

/** Fixed-point scale of the input scores: `10000` units == 1.0 block/tick. */
const FIXED_POINT_PER_BLOCK = 10000;

/** Block/tick velocity -> the integer score the api functions read. */
function toFixedPoint(blocksPerTick: number): number {
  return Math.round(blocksPerTick * FIXED_POINT_PER_BLOCK);
}

const installed = new WeakMap<Datapack, PlayerMotion>();

function definePlayerMotion(dp: Datapack): PlayerMotion {
  const I = createInternals(dp);
  defineInit(I);
  defineStore(I);
  defineLaunch(I);
  defineMath(I);
  defineApi(I);
  // Write the three input scores from a local/global velocity (block/tick floats).
  const setLocal = (ctx: FunctionContext, v: LocalVelocity): void => {
    I.input.x.set(toFixedPoint(v.sideways ?? 0));
    I.input.y.set(toFixedPoint(v.up ?? 0));
    I.input.z.set(toFixedPoint(v.forward ?? 0));
  };
  const setGlobal = (ctx: FunctionContext, v: GlobalVelocity): void => {
    I.input.x.set(toFixedPoint(v.x ?? 0));
    I.input.y.set(toFixedPoint(v.y ?? 0));
    I.input.z.set(toFixedPoint(v.z ?? 0));
  };

  return {
    launchLocal(ctx: FunctionContext, v: LocalVelocity): void {
      setLocal(ctx, v);
      ctx.call(I.fLaunchLocal);
    },
    launchGlobal(ctx: FunctionContext, v: GlobalVelocity): void {
      setGlobal(ctx, v);
      ctx.call(I.fLaunchGlobal);
    },
    applyLocal(ctx: FunctionContext, v?: LocalVelocity): void {
      I.sustain.set(1);
      if (v) setLocal(ctx, v);
      ctx.call(I.fLaunchLocal);
    },
    applyGlobal(ctx: FunctionContext, v?: GlobalVelocity): void {
      I.sustain.set(1);
      if (v) setGlobal(ctx, v);
      ctx.call(I.fLaunchGlobal);
    },
    launchLocalXyz: I.fLaunchLocal,
    launchGlobalXyz: I.fLaunchGlobal,
    launchInput: I.input,
  };
}

declare module "helix" {
  interface Datapack {
    /** Installs the {@link PlayerMotion} library (idempotent) and returns its handle. */
    playerMotion(): PlayerMotion;
  }
}

export const playerMotion: KitPlugin = {
  name: "player_motion",
  install() {
    Datapack.prototype.playerMotion = function (this: Datapack): PlayerMotion {
      const existing = installed.get(this);
      if (existing) return existing;
      const pm = definePlayerMotion(this);
      installed.set(this, pm);
      return pm;
    };
  },
};
