import { Datapack } from "helix";
import type { KitPlugin } from "../../plugin";
import { defineGrapple } from "./grapple.module";
import type { Grapple } from "./grapple.module";
import type { GrappleOptions } from "./state";

export type { Grapple } from "./grapple.module";
export type { GrappleOptions } from "./state";

/**
 * Grapple/swing built on `player_motion`'s per-tick impulse.
 *
 * `grapple/start` raycasts to a block and anchors there; each tick pulls grappling players
 * along
 * a rope to their anchor; `grapple/stop` releases. The rope is a particle line, since a
 * real
 * leash can't be drawn by command. Options: {@link GrappleOptions}. Wiring:
 * `grapple.module.ts`.
 */

const installed = new WeakMap<Datapack, Grapple>();

declare module "helix" {
  interface Datapack {
    /**
     * Installs the {@link Grapple} feature (idempotent) and returns its handle.
     * The handle is cached, so options from the first call win.
     */
    grapple(opts?: GrappleOptions): Grapple;
  }
}

export const grapple: KitPlugin = {
  name: "grapple",
  deps: ["player_motion", "raycast"],
  install() {
    Datapack.prototype.grapple = function (this: Datapack, opts: GrappleOptions = {}): Grapple {
      const existing = installed.get(this);
      if (existing) return existing;
      const g = defineGrapple(this, opts);
      installed.set(this, g);
      return g;
    };
  },
};
