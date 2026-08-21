import { ResourceId } from "./resource";
import { Float, toSnbt } from "./nbt";
import { atLeast } from "./entity-nbt";
import type { VersionProfile } from "../../versions/profile";

/**
 * A **particle with options** - the `dust` particles whose
 * id alone is not enough to draw them.
 *
 * `Particle.DUST` is only a registry id, and `/particle minecraft:dust ~ ~ ~` is
 * a parse error: the type carries a colour and a size. This is that id *plus* its
 * data, and it extends {@link ResourceId} so it drops into every slot a plain
 * `Particle` already fits ({@link FunctionContext.particle}, a biome's ambient
 * particle) with no new overloads.
 *
 * **The version split it exists to hide.** 1.20.5 moved particle options out of
 * positional command arguments and into SNBT on the id:
 *
 *   1.20.4 and older  ->  `dust 1.0 0.0 0.0 1.5`
 *   1.20.5 and newer  ->  `dust{color:[1.0f,0.0f,0.0f],scale:1.5f}`
 *
 * Colours are packed RGB ints (`0xff0000`), the same spelling {@link Firework}
 * uses, and are emitted as the float triple both eras accept - 1.21.2 widened the
 * modern field to a packed int, but never stopped taking the triple, so one
 * encoding covers every supported version.
 *
 * Transcribed from vanilla-mcdoc `java/util/particle.mcdoc`.
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
    // Loud rather than silently dropping the options: a bare `render()` (a biome's
    // ambient particle, say) would otherwise emit an id that no longer parses.
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
// 4dp because a channel only has 256 steps: more digits are noise, and a ring is
// twenty of these on one line each.
const rgb = (color: number) =>
  [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff].map(
    (c) => Math.round((c / 255) * 1e4) / 1e4,
  );

/** `1.0f` in SNBT, `1.0` as a bare 1.20.4-era command argument. */
const plain = (n: number) => (Number.isInteger(n) ? `${n}.0` : String(n));

const modern = (version: VersionProfile) => atLeast(version, "1.20.5");

/**
 * The classic **coloured redstone dust** particle: any colour, any size. The one
 * to reach for when a effect wants a colour vanilla has no particle for.
 *
 *   ctx.particle(Dust(0xff3b00, 1.5), Pos.here(), Pos(0, 0, 0), 0, 1);
 *   // 1.21.4:  particle minecraft:dust{color:[1.0f,0.23f,0.0f],scale:1.5f} ...
 *   // 1.20.4:  particle minecraft:dust 1.0 0.23 0.0 1.5 ...
 *
 * `scale` is the sprite size, clamped by vanilla to `0.01..4`.
 */
export const Dust = (color: number, scale = 1): ParticleOptionsValue =>
  new ParticleOptionsValue("dust", (version) =>
    modern(version)
      ? toSnbt({ color: rgb(color).map(Float), scale: Float(scale) }, version)
      : ` ${rgb(color).map(plain).join(" ")} ${plain(scale)}`,
  );

/**
 * Dust that **fades from one colour to another** over its life - a gradient trail
 * for the price of one particle.
 *
 * ponytail: the pre-1.20.5 argument order is `from scale to`, not `from to
 * scale`; the modern struct spells the same three fields in the other order.
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
