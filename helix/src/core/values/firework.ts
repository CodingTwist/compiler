import { CommandValue } from "./value";
import { Byte, IntArray, toSnbt } from "./nbt";
import { VersionProfile } from "../../versions/profile";

/**
 * The five vanilla firework-explosion shapes. Named-constant namespace + union
 * type (declaration merging), same stance as {@link Gamemode}: author
 * `FireworkShape.SMALL_BALL` over the bare, typo-prone `"small_ball"`.
 */
export const FireworkShape = {
  SMALL_BALL: "small_ball",
  LARGE_BALL: "large_ball",
  STAR: "star",
  CREEPER: "creeper",
  BURST: "burst",
} as const;
export type FireworkShape = (typeof FireworkShape)[keyof typeof FireworkShape];

/** One burst of a rocket. Colors are packed RGB ints - write them as `0xff0000`. */
export interface FireworkExplosionInput {
  shape: FireworkShape;
  /** Primary colors, packed RGB (`0xff0000` = red). At least one, or the burst is invisible. */
  colors: readonly number[];
  /** Colors the burst fades to. */
  fadeColors?: readonly number[];
  /** The diamond-trail effect. */
  trail?: boolean;
  /** The glowstone-dust twinkle/crackle. */
  twinkle?: boolean;
}

export interface FireworkInput {
  /** Gunpowder count: flight time in "levels" (1-3), and the fuse of a *fired* rocket. */
  flight?: number;
  explosions?: readonly FireworkExplosionInput[];
}

/**
 * The `minecraft:fireworks` component - a rocket's bursts and flight duration.
 *
 * Note the damage rule this exists to make obvious: a rocket with **no
 * explosions does no damage**, however it is fired. Give it at least one.
 *
 *   Item.FIREWORK_ROCKET.firework(
 *     Firework({ flight: 1, explosions: [{ shape: FireworkShape.SMALL_BALL, colors: [0xff0000] }] }),
 *   )
 */
export class FireworkValue implements CommandValue {
  constructor(private readonly input: FireworkInput) {}

  render(version: VersionProfile): string {
    const { flight, explosions = [] } = this.input;
    return toSnbt(
      {
        explosions: explosions.map((e) => ({
          shape: e.shape,
          colors: IntArray(e.colors),
          ...(e.fadeColors ? { fade_colors: IntArray(e.fadeColors) } : {}),
          ...(e.trail !== undefined ? { has_trail: e.trail } : {}),
          ...(e.twinkle !== undefined ? { has_twinkle: e.twinkle } : {}),
        })),
        ...(flight !== undefined ? { flight_duration: Byte(flight) } : {}),
      },
      version,
    );
  }
}

export type Firework = FireworkValue;
export const Firework = (input: FireworkInput): FireworkValue => new FireworkValue(input);
