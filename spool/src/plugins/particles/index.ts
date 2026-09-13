import { FunctionContext, Pos, round6 } from "helix";
import type { Particle, Selector } from "helix";
import type { KitPlugin } from "../../plugin";

export interface RingOptions {
  /** Blocks from the centre. */
  radius: number;
  /** Particles in the ring, and commands it costs. Default 16. */
  count?: number;
  /** Height of the ring above the run position. Default 0. */
  y?: number;
  /**
   * Turns while drawing. `1` is a closed ring, `2.5` a spiral (use with {@link rise}).
   * Default 1.
   */
  turns?: number;
  /** Blocks climbed over the whole draw - `0` is flat. Default 0. */
  rise?: number;
  /** Where the ring starts, in degrees. Default 0. */
  offset?: number;
  /** Each particle's own `<delta>` spread and `<speed>`. Default still, at 0. */
  delta?: readonly [number, number, number];
  speed?: number;
  /** Draw past the client's particle-distance/count limits. */
  force?: boolean;
  /** Who sees it. Default everyone in range. */
  viewers?: Selector;
}

/**
 * `particles`: draw shapes out of particles.
 *
 * Unrolled at build time into one `particle ~x ~y ~z` per point, so no runtime maths.
 * World-relative, so it doesn't tilt with the runner's pitch.
 *
 * ```ts
 * installKit([particles]);
 *
 * // A flat white ring at blade height, and a rising spiral of embers:
 * ctx.particleRing(Dust(0xffffff, 0.8), { radius: 1.2, y: 0.7, count: 20 });
 * ctx.particleRing(Particle.FLAME, { radius: 0.6, turns: 3, rise: 2, count: 24 });
 * ```
 *
 * ponytail: `count` is the command cost every time; avoid large rings every tick.
 */
declare module "helix" {
  interface FunctionContext {
    /** Draw a ring (or spiral) of `particle` around the run position. */
    particleRing(particle: Particle, opts: RingOptions): void;
  }
}

export const particles: KitPlugin = {
  name: "particles",
  install(): void {
    FunctionContext.prototype.particleRing = function (
      this: FunctionContext,
      particle: Particle,
      opts: RingOptions,
    ): void {
      const {
        radius,
        count = 16,
        y = 0,
        turns = 1,
        rise = 0,
        offset = 0,
        delta = [0, 0, 0],
        speed = 0,
        force,
        viewers,
      } = opts;

      for (let i = 0; i < count; i++) {
        const t = i / count;
        const angle = ((offset + t * 360 * turns) * Math.PI) / 180;
        const pos = Pos.rel(
          round6(Math.cos(angle) * radius),
          round6(y + t * rise),
          round6(Math.sin(angle) * radius),
        );
        const spread = Pos(...delta);
        if (force || viewers) {
          this.particle().force(particle, pos, spread, speed, 1, viewers);
        } else {
          this.particle(particle, pos, spread, speed, 1);
        }
      }
    };
  },
};
