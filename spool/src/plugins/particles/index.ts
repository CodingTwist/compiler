import { FunctionContext, Pos, round6 } from "helix";
import type { Particle, Selector } from "helix";
import type { KitPlugin } from "../../plugin";

export interface RingOptions {
  /** Blocks from the centre. */
  radius: number;
  /** Particles in the ring - also how many commands this costs. Default 16. */
  count?: number;
  /** Height of the ring above the run position. Default 0. */
  y?: number;
  /**
   * Turns to make while drawing. `1` is a closed ring; `2.5` is a spiral of two
   * and a half turns (pair it with {@link rise}). Default 1.
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
 * **`particles`** - draw a *shape*, not a point.
 *
 * Vanilla's own `<delta>`/`<count>` already gives you a random cloud in one
 * command, so this adds the one thing it can't: particles at **chosen** places.
 * The ring is unrolled at build time into `count` `particle ~x ~y ~z` commands
 * about wherever the function runs, so it costs no scoreboard, no recursion and
 * no runtime trig - and, being world-relative, it doesn't skew with the runner's
 * pitch the way `^ ^ ^` would.
 *
 * ```ts
 * installKit([particles]);
 *
 * // A flat white ring at blade height, and a rising spiral of embers:
 * ctx.particleRing(Dust(0xffffff, 0.8), { radius: 1.2, y: 0.7, count: 20 });
 * ctx.particleRing(Particle.FLAME, { radius: 0.6, turns: 3, rise: 2, count: 24 });
 * ```
 *
 * ponytail: build-time unroll, so `count` is a literal cost - 20 particles is 20
 * commands every time it fires. Fine on a hit or a shot; think twice per tick.
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
