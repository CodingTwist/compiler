import { Datapack } from "helix";
import type { KitPlugin } from "../../plugin";
import { defineGrapple } from "./grapple.module";
import type { Grapple } from "./grapple.module";
import type { GrappleOptions } from "./config";

export type { Grapple } from "./grapple.module";
export type { GrappleOptions } from "./config";

/**
 * A grapple / swing built on `player_motion`'s sustained per-tick impulse (`applyGlobal`).
 * `grapple/start` raycasts (via the `raycast` plugin) from the player's eyes to a solid
 * block, anchors there, and tags the player; a tick loop then pulls every grappling player
 * toward their anchor each tick (a world-space velocity copied into player_motion's
 * `launchInput`), which reads as a swing. `grapple/stop` releases.
 *
 * The physics touches none of player_motion's internals, just its public `launchInput` +
 * `applyGlobal`/`launchLocalXyz` handle (via `this.playerMotion()`). It `deps` on the
 * `player_motion` plugin (for that handle) and the `raycast` plugin (for the web ray).
 *
 * Motion is a **pendulum** (see `tuning.ts`/`swing.service.ts`): the web fixes a radius and
 * the rope cancels the full radial velocity each tick, so engine gravity (left on) arcs you
 * through the swing and you fling off tangentially on release. Flip `ZERO_GRAVITY` on (off by
 * default) to instead zero gravity with a removable attribute while grappling - a pure
 * momentum orbit with a dead-still hang; `stop` restores gravity.
 *
 * **Customisable** via {@link GrappleOptions}: restrict the anchor block (`anchorOn`) and the
 * reach (`maxReach`). **The rope is visible** - each tick `drive` draws a particle line from
 * the player's hand to the anchor marker (a real leash can't be drawn by command); `stop` ends
 * it. The implementation is a NestJS-style module - see `grapple.module.ts` for the wiring.
 */

const installed = new WeakMap<Datapack, Grapple>();

declare module "helix" {
  interface Datapack {
    /**
     * Install the {@link Grapple} feature into this pack (idempotent) and return its handle.
     * Registers the tick loop + `grapple/{start,stop}` and pulls in `player_motion` +
     * `raycast`. Pass {@link GrappleOptions} to restrict anchor blocks or change the reach;
     * the handle is cached, so options on the **first** call win.
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
