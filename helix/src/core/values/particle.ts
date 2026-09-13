import { ResourceId } from "./resource";
import { Float, toSnbt } from "./nbt";
import { atLeast } from "./entity-nbt";
import type { VersionProfile } from "../../versions/profile";

/**
 * A particle id plus options, e.g. `dust` with a colour and size. Works anywhere a
 * `Particle` does.
 *
 * 1.20.5 moved options from arguments into SNBT:
 *
 *   1.20.4 and older  ->  `dust 1.0 0.0 0.0 1.5`
 *   1.20.5 and newer  ->  `dust{color:[1.0f,0.0f,0.0f],scale:1.5f}`
 *
 * Colours are packed RGB, emitted as a float triple, which every version accepts.
 */
export class ParticleOptionsValue extends ResourceId<"minecraft:particle_type"> {
  constructor(
    id: string,
    /** Rendered options for a version, INCLUDING its leading `{` or ` `. */
    private readonly options: (version: VersionProfile) => string,
  ) {
    super(id, "minecraft:particle_type");
  }

  render(version?: VersionProfile): string {
    // Throw instead of dropping options: a bare id wouldn't parse.
    if (!version) {
      throw new Error(
        `${super.render()} carries particle options, which render differently per ` +
          `version - render it with a version (a biome's ambient particle wants ` +
          `\`particleRaw\` instead).`,
      );
    }
    return super.render() + this.options(version);
  }
}

/** A packed-RGB int (`0xff0000`) as the `[r,g,b]` float triple every version takes. */
// 4 decimal places; a channel only has 256 steps.
const rgb = (color: number) =>
  [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff].map(
    (c) => Math.round((c / 255) * 1e4) / 1e4,
  );

/** `1.0f` in SNBT, `1.0` as a bare 1.20.4-era command argument. */
const plain = (n: number) => (Number.isInteger(n) ? `${n}.0` : String(n));

const modern = (version: VersionProfile) => atLeast(version, "1.20.5");

/**
 * Coloured dust particle, any colour and size.
 *
 *   ctx.particle(Dust(0xff3b00, 1.5), Pos.here(), Pos(0, 0, 0), 0, 1);
 *   // 1.21.4:  particle minecraft:dust{color:[1.0f,0.23f,0.0f],scale:1.5f} ...
 *   // 1.20.4:  particle minecraft:dust 1.0 0.23 0.0 1.5 ...
 *
 * `scale` is clamped by vanilla to `0.01..4`.
 */
export const Dust = (color: number, scale = 1): ParticleOptionsValue =>
  new ParticleOptionsValue("dust", (version) =>
    modern(version)
      ? toSnbt({ color: rgb(color).map(Float), scale: Float(scale) }, version)
      : ` ${rgb(color).map(plain).join(" ")} ${plain(scale)}`,
  );

/**
 * Dust that fades from one colour to another.
 *
 * ponytail: pre-1.20.5 argument order is `from scale to`.
 */
export const DustTransition = (
  from: number,
  to: number,
  scale = 1,
): ParticleOptionsValue =>
  new ParticleOptionsValue("dust_color_transition", (version) =>
    modern(version)
      ? toSnbt(
          {
            from_color: rgb(from).map(Float),
            to_color: rgb(to).map(Float),
            scale: Float(scale),
          },
          version,
        )
      : ` ${rgb(from).map(plain).join(" ")} ${plain(scale)} ${rgb(to).map(plain).join(" ")}`,
  );
