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
 * A typed port of the published `player_motion` datapack
 * (https://github.com/MulverineX/player_motion): launch a player by applying an
 * `apply_impulse` enchantment to a dummy saddle, decomposing a velocity vector
 * into a 32-bit-per-axis score tree the enchantment reads.
 *
 * Scope (decided with the user): the **modern recommended API only**, and **no
 * macros**. `launch_local_xyz` (common viewport==context path) and
 * `launch_global_xyz` (small-vector path, |x|,|y|,|z| <= 12398) compile to pure
 * command/scoreboard math. The upstream macro paths - large-vector
 * `convert_large_to_local`, mismatched-context `local_to_global`, polar-local
 * rotation, and the deprecated `launch_xyz`/`launch_looking` buckets - are **not**
 * ported (helix has no macro engine, and they are a documented perf cost upstream);
 * those branches early-`return fail` so a caller gets a clear "unsupported in this
 * build" signal instead of silently-wrong motion.
 *
 * Everything compiles into the consuming pack's own namespace (helix is
 * single-namespace), so the library is inlined rather than referenced as a
 * separate `player_motion:` pack. The scoreboard objective names keep their
 * `player_motion.*` form (global names, shared with the enchantment JSON).
 *
 * The implementation is split by concern - see the sibling files: `resources.ts`
 * (enchantment + predicate JSON), `context.ts` (the shared objectives / score
 * helpers / function refs threaded everywhere), `init.ts`, `store.ts` (32-bit
 * decomposition), `launch.ts` (main/reset/use_previous/polar), `math.ts`
 * (reference vectors + convert-to-local), and `api.ts` (the two entry points).
 * This file is just the public type + plugin + orchestration.
 */
/**
 * A velocity relative to the player's facing, in blocks/tick. Every axis is
 * optional and defaults to 0, so `{ up: 0.8, forward: 1.2 }` reads as itself.
 * Used by {@link PlayerMotion.launchLocal} (the player must be the run context).
 */
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
  /**
   * Launch the executing player by `velocity` **relative to their facing**
   * (sideways/up/forward in blocks/tick). Emits the input writes + the call, so
   * one line replaces the set-three-scores-then-call dance. Must run positioned
   * as the player (e.g. `execute as @p at @s run ...`).
   */
  launchLocal(ctx: FunctionContext, velocity: LocalVelocity): void;
  /**
   * Launch the executing player by `velocity` **along world axes** (x/y/z in
   * blocks/tick). Must run `at` the player. Inputs outside +/-12398 blocks/tick
   * per axis hit the unsupported large-vector path and `return fail`.
   */
  launchGlobal(ctx: FunctionContext, velocity: GlobalVelocity): void;

  /**
   * Like {@link launchLocal}, but a **sustained per-tick** impulse: it skips the
   * gamemode-swap trigger and relies on the player *already moving* to fire the
   * enchantment that tick. Call it every tick (`execute as @a[tag=…] at @s run …`)
   * to drive continuous motion - a thrust, a grapple, the arc of a swing. The
   * very first kick from a standstill still needs {@link launchLocal} (which
   * forces the trigger); use this to maintain motion once underway.
   *
   * Omit `velocity` to sustain whatever is already in {@link launchInput} - the
   * way to drive a **runtime-computed** vector (set the input scores yourself,
   * then call this with no velocity).
   */
  applyLocal(ctx: FunctionContext, velocity?: LocalVelocity): void;
  /**
   * Like {@link launchGlobal}, but a **sustained per-tick** impulse along world
   * axes - the natural fit for swing/grapple physics, where each tick you
   * recompute a world-space velocity (e.g. toward an anchor) and re-apply it. See
   * {@link applyLocal} for the swap-free trigger model, the standstill caveat, and
   * the no-velocity (runtime {@link launchInput}) form.
   *
   * Note: a velocity past the +/-12398 large-vector limit `return fail`s before the
   * sustain flag is cleared, so it can leak into the next launch - a non-issue for
   * per-tick velocities (a few blocks/tick), which is the only place this is used.
   */
  applyGlobal(ctx: FunctionContext, velocity?: GlobalVelocity): void;

  // --- Lower-level handles (for manual control / cross-referencing) -----------
  /** `api/launch_local_xyz` - the raw function, to `ctx.call` yourself after setting {@link launchInput}. */
  readonly launchLocalXyz: FunctionRef;
  /** `api/launch_global_xyz` - the raw function, to `ctx.call` yourself after setting {@link launchInput}. */
  readonly launchGlobalXyz: FunctionRef;
  /**
   * The `$x/$y/$z player_motion.api.launch` input scores, as typed `Score`s. These
   * are **fixed-point**: `10000` == 1.0 block/tick. Prefer {@link launchLocal} /
   * {@link launchGlobal}, which take plain block/tick floats and convert for you.
   */
  readonly launchInput: { readonly x: Score; readonly y: Score; readonly z: Score };
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
    ctx.scoreSet(I.inputX.set(toFixedPoint(v.sideways ?? 0)));
    ctx.scoreSet(I.inputY.set(toFixedPoint(v.up ?? 0)));
    ctx.scoreSet(I.inputZ.set(toFixedPoint(v.forward ?? 0)));
  };
  const setGlobal = (ctx: FunctionContext, v: GlobalVelocity): void => {
    ctx.scoreSet(I.inputX.set(toFixedPoint(v.x ?? 0)));
    ctx.scoreSet(I.inputY.set(toFixedPoint(v.y ?? 0)));
    ctx.scoreSet(I.inputZ.set(toFixedPoint(v.z ?? 0)));
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
      ctx.scoreSet(I.sustain.set(1));
      if (v) setLocal(ctx, v);
      ctx.call(I.fLaunchLocal);
    },
    applyGlobal(ctx: FunctionContext, v?: GlobalVelocity): void {
      ctx.scoreSet(I.sustain.set(1));
      if (v) setGlobal(ctx, v);
      ctx.call(I.fLaunchGlobal);
    },
    launchLocalXyz: I.fLaunchLocal,
    launchGlobalXyz: I.fLaunchGlobal,
    launchInput: { x: I.inputX, y: I.inputY, z: I.inputZ },
  };
}

declare module "helix" {
  interface Datapack {
    /**
     * Install the {@link PlayerMotion} library into this pack (idempotent) and
     * return its handle. Registers the internal functions, the `apply_impulse`
     * enchantment, the two predicates, and a `load`-tagged `internal/init`.
     */
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
