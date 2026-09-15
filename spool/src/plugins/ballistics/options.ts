import { Selector } from "helix";
import type { EntityType, FunctionContext, Score } from "helix";
import { PROJECTILES } from "./projectiles";
import type { ShellOptions, ShellSpec } from "./shell";

/**
 * Options for a shot solved in game, so it can follow a moving target.
 *
 * With flight time fixed, the launch velocity is one division, so the game only reads
 * positions,
 * subtracts, divides and writes `Motion`:
 *
 * ```
 *   v = (target - launcher - ĵ·G(n)) / A(n)
 * ```
 *
 * The function returns `0` and doesn't fire when an axis would exceed vanilla's ±10 Motion
 * limit,
 * because vanilla zeroes it instead of clamping (the TNT would drop on the thrower).
 *
 * Unlike `ctx.ballistic()`, `ticks` is the only aiming option: shorter is flatter, longer
 * is a lob.
 */
export interface RuntimeShotOptions extends ShellOptions {
  /** Who throws. Default `@s`. */
  readonly from?: Selector;
  /** What to hit. Default `@p`. */
  readonly to?: Selector;
  /** Flight time in ticks. Default `40`. Also the TNT fuse, so it explodes on arrival. */
  readonly ticks?: number;
  /**
   * Aim where the target will be instead of where it is. Default off; costs a per-tick
   * tracker.
   *
   * Players only. Pass a {@link Score} to switch it at runtime: `0` aims straight, `1`
   * leads.
   */
  readonly lead?: boolean | Score;
  /**
   * Where the shell comes from, instead of an inline `/summon`.
   *
   * A string names a function holding the one summon line, so the built pack has an
   * editable file
   * per shot. Names must be unique, since each has its own fuse.
   *
   * A callback runs at the launch position and must leave an entity tagged with
   * `spec.tags`,
   * e.g. for a macro shell or an existing entity.
   */
  readonly shellFunction?:
    | string
    | ((ctx: FunctionContext, spec: ShellSpec) => void);
  /**
   * Every type a callback `shellFunction` can summon, so finding the shot doesn't scan other
   * entities. Several types share one entity type tag.
   */
  readonly shellTypes?: readonly EntityType[];
  // What to throw - `projectile` (the maths) and `shell` (the NBT) - comes from
  // `ShellOptions`, shared with the build-time half so a shell is described the same way
  // whichever solver fires it.
}

/** The options with every default filled in - the one place they live. */
export function resolveShotOptions(opts: RuntimeShotOptions) {
  const ticks = Math.round(opts.ticks ?? 40);
  if (ticks < 1)
    throw new Error(`ballistics: ticks must be >= 1, got ${ticks}.`);
  return {
    ...opts,
    ticks,
    from: opts.from ?? Selector.self(),
    to: opts.to ?? Selector.nearest(),
    profile: opts.projectile ?? PROJECTILES.tnt,
  };
}
