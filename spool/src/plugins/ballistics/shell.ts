/**
 * **What gets thrown.** The plugin owns the *maths* - which entity's gravity and drag to
 * invert ({@link ProjectileProfile}), and the velocity that hits the target. It owns
 * nothing about the projectile's NBT: that is the author's, whole.
 *
 * So the shell is a **factory the author supplies**. The plugin hands it the three things
 * only the solver knows - the launch velocity, the fuse it picked, and any tag the shot
 * needs to be findable by - and takes back whatever entity NBT comes out:
 *
 * ```ts
 * // TNT rendered as a diamond block
 * { shell: (s) => Tnt({ ...s, blockState: Block.DIAMOND_BLOCK }) }
 * // an anvil dropped from orbit
 * { projectile: PROJECTILES.falling_block, shell: (s) => FallingBlock({ ...s, blockState: Block.ANVIL }) }
 * // a glowing named arrow
 * { projectile: PROJECTILES.arrow, shell: (s) => Arrow({ ...s, glowing: true, customName: "Zeus" }) }
 * ```
 *
 * Both halves of the plugin (`static.ts`, `runtime.ts`) go through here, so the shell is
 * described the same way whether the shot is solved at build time or in game.
 */
import { Tnt } from "helix";
import type { FunctionContext, IdentifiedEntityNbt, Pos } from "helix";
import type { ProjectileProfile } from "./physics";

/** What the solver knows about the shot, handed to the {@link ShellFactory}. */
export interface ShellSpec {
  /**
   * The launch velocity, blocks/tick. **Spread it in** - `Motion` is the shot. The
   * runtime half passes `[0, 0, 0]`: it writes the real value with `store … entity
   * Motion[i]` right after the summon, which needs the list to already exist.
   */
  readonly motion: readonly number[];
  /**
   * The fuse the solver picked (the flight time, so a TNT shell airbursts on the target),
   * or `undefined` for a projectile with no fuse or `fuse: false`. Ignore it for an
   * entity where it means nothing.
   */
  readonly fuse?: number;
  /**
   * Tags the shot needs to carry. The runtime half finds the entity it just summoned by
   * one of these, so **it must reach the NBT** or the shot leaves with zero motion.
   */
  readonly tags?: readonly string[];
}

/**
 * Builds the projectile's NBT from what the solver knows. The default is
 * `(spec) => Tnt(spec)` - plain primed TNT.
 */
export type ShellFactory = (spec: ShellSpec) => IdentifiedEntityNbt;

/** The projectile half of both {@link BallisticOptions} and {@link RuntimeShotOptions}. */
export interface ShellOptions {
  /**
   * Whose flight to invert - gravity, drag and integrator order. Default
   * {@link PROJECTILES.tnt}. Maths only: **`shell` is what actually gets summoned**, so
   * this just has to describe how that entity falls.
   */
  readonly projectile?: ProjectileProfile;
  /** The projectile's NBT. Default: primed TNT with nothing but the solver's own fields. */
  readonly shell?: ShellFactory;
  /**
   * Override the fuse handed to the shell, in ticks, or `false` for none - the shot lands
   * instead of airbursting. Defaults to the flight time.
   */
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
  // The author's value *is* the entity - its schema names the type, so nothing here
  // decides what flies. `projectile` only told the solver how it falls.
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
