import { Pos, EntityAnchor } from "helix";
import { DEBUG } from "./tuning";
import type { GrappleFunctions } from "./functions";
import type { GrappleSelectors } from "./selectors";
import type { RaycastRef } from "../raycast";
import type { AttachService } from "./attach.service";
import type { SwingService } from "./swing.service";
import type { ReleaseService } from "./release.service";

interface ControllerDeps {
  fn: GrappleFunctions;
  selectors: GrappleSelectors;
  ray: RaycastRef;
  attach: AttachService;
  swing: SwingService;
  release: ReleaseService;
}

/**
 * The **controller**: the plugin's three invoked entry functions - the "routes." Each is
 * thin, wiring the run context and delegating the body to a service:
 *
 *   - `grapple/start` (public)  → fire the web raycast, then latch on a hit.
 *   - `grapple/tick`  (tick)    → drive every grappling player.
 *   - `grapple/stop`  (public)  → release the executing player.
 *
 * No physics or state maths here; that's the services. `drive`/`constrain`/`rope` aren't
 * routes (never called from outside) - the swing/rope services own those.
 */
export function defineController(d: ControllerDeps): void {
  // grapple/start - run as + at the player. Cast the web from the eyes; on a hit (the anchor
  // service placed a marker) latch the player, else report the miss.
  d.fn.start.build((ctx) => {
    // Root the web at the eye position and fire the ray (seeds its reach + marches).
    ctx
      .execute()
      .at(d.selectors.self())
      .anchored(EntityAnchor.EYES)
      .positioned(Pos.local(0, 0, 0))
      .run((b) => d.ray.fire(b));

    // Latch only if the ray actually placed an anchor (a filtered/missed cast summons nothing,
    // so this stays un-run and no stale rope radius carries over).
    ctx.execute().ifEntity(d.selectors.freshAnchor()).run((b) => d.attach.latch(b));

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
