import { Pos, EntityAnchor } from "helix";
import { DEBUG } from "./tuning";
import type { RaycastRef } from "../raycast";
import type { AttachService } from "./attach.service";
import type { SwingService } from "./swing.service";
import type { ReleaseService } from "./release.service";
import type { GrappleFunctions, GrappleSelectors } from "./state";

interface ControllerDeps {
  fn: GrappleFunctions;
  selectors: GrappleSelectors;
  ray: RaycastRef;
  attach: AttachService;
  swing: SwingService;
  release: ReleaseService;
}

/**
 * The plugin's entry functions, each delegating to a service:
 *
 * - `grapple/start` (public): fire the web and latch on a hit.
 * - `grapple/tick` (tick): drive every grappling player.
 * - `grapple/stop` (public): release the executing player.
 */
export function defineController(d: ControllerDeps): void {
  // grapple/start, run as and at the player: cast from the eyes, latch on a hit, else
  // report a miss.
  d.fn.start.build((ctx) => {
    // Root the web at the eye position and fire the ray (seeds its reach + marches).
    ctx
      .execute()
      .at(d.selectors.self())
      .anchored(EntityAnchor.EYES)
      .positioned(Pos.local(0, 0, 0))
      .run((b) => d.ray.fire(b));

    // Only latch if the ray placed an anchor, so no stale rope length carries over.
    ctx
      .execute()
      .ifEntity(d.selectors.freshAnchor())
      .run((b) => d.attach.latch(b));

    if (DEBUG) {
      ctx
        .execute()
        .unlessEntity(d.selectors.freshAnchor())
        .run((b) => b.tellraw(d.selectors.self(), "[grapple] nothing to grab"));
    }
  });

  // grapple/tick - fan the drive out over every grappling player.
  d.fn.tick.build((ctx) => d.swing.driveAll(ctx));

  // grapple/stop - release the executing player.
  d.fn.stop.build((ctx) => d.release.release(ctx));
}
