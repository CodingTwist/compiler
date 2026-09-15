import { CommandValue } from "./value";
import { Byte, IntArray, toSnbt } from "./nbt";
import { VersionProfile } from "../../versions/profile";

/** The five firework shapes. Use `FireworkShape.SMALL_BALL`. */
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
  /** Primary colours, packed RGB. Needs at least one or the burst is invisible. */
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
 * The `minecraft:fireworks` component: bursts and flight duration.
 *
 * A rocket with no explosions does no damage.
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
export const Firework = (input: FireworkInput): FireworkValue =>
  new FireworkValue(input);
