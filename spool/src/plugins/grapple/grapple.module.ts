import type { Datapack } from "helix";
import { createDebugService } from "./debug.service";
import { createRopeService } from "./rope.service";
import { createAttachService } from "./attach.service";
import { createSwingService } from "./swing.service";
import { createReleaseService } from "./release.service";
import { defineController } from "./grapple.controller";
import { createAnchorService, createConfig, createConstants, createFunctions, createScratch, createSelectors, createStateRepository, defineInit } from "./state";
import type { GrappleOptions } from "./state";

/** The public handle {@link Datapack.grapple} returns - just the two entry functions. */
export interface Grapple {
  /**
   * `grapple/start` - raycast an anchor, tag the player, and kick them toward it.
   * **Must run as + at the player** (e.g. `execute as @p at @s run function …`).
   */
  readonly start: import("helix").FunctionRef;
  /** `grapple/stop` - release the executing player (removes the `grappling` tag). */
  readonly stop: import("helix").FunctionRef;
}

/**
 * The grapple **module** (the NestJS composition root): construct every provider once, then
 * the services on top of them, then wire the lifecycle + controller. Each service is handed
 * only the providers its signature declares, so there is no god-object - the dependency graph
 * is spelled out right here.
 *
 * Provider layers, built bottom-up:
 *   config / selectors / scratch / constants - leaf providers (no deps between them)
 *   motion (`player_motion`) + repository     - the persistent state + the launch handle
 *   services                                  - debug / rope / anchor / attach / swing / release
 *   raycast (`raycast` plugin)                - the web ray, whose on-hit is the anchor service
 *   init + controller                         - the load seed + the three invoked routes
 */
export function defineGrapple(dp: Datapack, opts: GrappleOptions): Grapple {
  // --- Providers -------------------------------------------------------------
  const config = createConfig(opts);
  const selectors = createSelectors();
  const scratch = createScratch();
  const consts = createConstants();
  const motion = dp.playerMotion();
  const repo = createStateRepository({ selectors, motion });
  const fn = createFunctions(dp);

  // --- Services --------------------------------------------------------------
  const debug = createDebugService({ scratch, selectors, repo });
  const rope = createRopeService({ scratch, selectors, repo, config, fn });
  const anchor = createAnchorService({ config, selectors, repo });
  const attach = createAttachService({ repo, consts, selectors, scratch });
  const swing = createSwingService({ repo, consts, selectors, motion, scratch, fn, debug, rope });
  const release = createReleaseService({ repo, consts, selectors, motion, scratch });

  const ray = dp.raycast({
    name: "grapple/web",
    maxSteps: config.maxSteps,
    hitOn: config.anchorOn,
    onHit: (ctx) => anchor.place(ctx),
  });

  // --- Lifecycle + controller ------------------------------------------------
  defineInit({ fn, scratch, repo, consts });
  defineController({ fn, selectors, ray, attach, swing, release });

  return { start: fn.start, stop: fn.stop };
}
