/**
 * What gets thrown: a factory you supply that turns the solver's values into entity NBT.
 *
 * ```ts
 * // TNT rendered as a diamond block
 * { shell: (s) => Tnt({ ...s, blockState: Block.DIAMOND_BLOCK }) }
 * // an anvil dropped from orbit
 * { projectile: PROJECTILES.falling_block, shell: (s) => FallingBlock({ ...s, blockState:
 * Block.ANVIL }) }
 * // a glowing named arrow
 * { projectile: PROJECTILES.arrow, shell: (s) => Arrow({ ...s, glowing: true, customName:
 * "Zeus" }) }
 * ```
 */
import { Tnt } from "helix";
import type { FunctionContext, IdentifiedEntityNbt, Pos } from "helix";
import type { ProjectileProfile } from "./physics";

/** What the solver knows about the shot, handed to the {@link ShellFactory}. */
export interface ShellSpec {
  /**
   * Launch velocity in blocks/tick; spread it in.
   * Runtime shots pass `[0, 0, 0]` so the list exists for the real value to be stored into.
   */
  readonly motion: readonly number[];
  /** The fuse the solver picked (the flight time), or `undefined` if none. */
  readonly fuse?: number;
  /**
   * Tags the shot must carry. The runtime finds the entity by them, so they must reach the
   * NBT.
   */
  readonly tags?: readonly string[];
}

/** Builds the projectile's NBT. Default: plain primed TNT. */
export type ShellFactory = (spec: ShellSpec) => IdentifiedEntityNbt;

/** The projectile half of both {@link BallisticOptions} and {@link RuntimeShotOptions}. */
export interface ShellOptions {
  /**
   * Whose physics to solve for. Default {@link PROJECTILES.tnt}. Should match what `shell`
   * summons.
   */
  readonly projectile?: ProjectileProfile;
  /** The projectile's NBT. Default: primed TNT with nothing but the solver's own fields. */
  readonly shell?: ShellFactory;
  /** Fuse in ticks, or `false` for none. Defaults to the flight time. */
  readonly fuse?: number | false;
}

/** Primed TNT carrying only what the solver put there. */
export const DEFAULT_SHELL: ShellFactory = (spec) => Tnt(spec);

/** Emit the `/summon` for one shot. */
export function summonShell(
  ctx: FunctionContext,
  pos: Pos,
  spec: ShellSpec & { readonly shell?: ShellFactory },
): void {
  const { shell = DEFAULT_SHELL, ...rest } = spec;
  // The shell's NBT decides the entity type.
  ctx.summon(shell(rest), pos);
}

/** The fuse a shot gets: the caller's override, else the flight time, else vanilla's. */
export function shellFuse(
  opts: { readonly fuse?: number | false },
  profile: ProjectileProfile,
  ticks: number,
): number | undefined {
  if (opts.fuse === false || profile.defaultFuse === undefined) return undefined;
  return Math.round(opts.fuse ?? ticks);
}
