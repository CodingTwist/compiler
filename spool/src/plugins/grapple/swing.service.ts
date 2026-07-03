import type { FunctionContext } from "helix";
import { DEBUG, LOG } from "./tuning";
import { senseSwingState, solveConstraint } from "./physics";
import { swingScratch } from "./scratch";
import type { Scratch } from "./scratch";
import type { StateRepository } from "./state.repository";
import type { Constants } from "./constants";
import type { GrappleSelectors } from "./selectors";
import type { GrappleFunctions } from "./functions";
import type { PlayerMotion } from "../player_motion";
import type { DebugService } from "./debug.service";
import type { RopeService } from "./rope.service";

interface SwingDeps {
  repo: StateRepository;
  consts: Constants;
  selectors: GrappleSelectors;
  motion: PlayerMotion;
  scratch: Scratch;
  fn: GrappleFunctions;
  debug: DebugService;
  rope: RopeService;
}

/**
 * The **swing service**: the per-tick pendulum. It owns `grapple/drive` (one player's
 * step) and `grapple/constrain` (the taut-tick rope solve), and exposes {@link driveAll}
 * for the tick controller to fan out over every grappling player. The maths lives in the
 * `physics` library; this file is the orchestration - `drive` reads as its four phases:
 * sense the state, (optionally) report it, turn it into a launch impulse, draw the rope.
 */
export function createSwingService(d: SwingDeps) {
  const scratch = swingScratch(d.scratch);

  // grapple/drive - one grappling player's per-tick swing step (run as + at them).
  d.fn.drive.build((ctx) => {
    senseSwingState(d, scratch, ctx); // position, velocity, vector-to-anchor, dist²/dot

    if (DEBUG) d.debug.readout(scratch, ctx);
    if (LOG) d.debug.log(scratch, ctx);

    applyRopeImpulse(ctx); // rope correction → player_motion, if taut

    d.rope.draw(ctx); // the visible particle line
  });

  // grapple/constrain - the rigid-rope constraint for one taut tick (see physics).
  d.fn.constrain.build(() => solveConstraint(d, scratch));

  /**
   * Turn the sensed state into this tick's launch impulse and fire it once. player_motion's
   * `applyGlobal` **adds** the impulse to the player's velocity, so:
   *
   *   - start from **zero** - the slack-tick baseline; a zero impulse adds nothing, so a slack
   *     tick leaves the player to fall under engine gravity untouched.
   *   - when **taut** (dist² ≥ ropeLen²), `grapple/constrain` overwrites that with the rope
   *     correction. Gate on radius alone, not `dot`: the constraint cancels the *full* radial
   *     velocity and its position trim must still fire when momentarily moving inward but
   *     drifted out. Going genuinely slack drops dist² below ropeLen², stopping this.
   *   - **clamp** per axis (caps the single big yank on the first taut tick of a fast grapple),
   *     then **sustain** the impulse (no gamemode swap; the swing's own motion fires it).
   */
  function applyRopeImpulse(ctx: FunctionContext): void {
    const launch = d.repo.launchVec();

    ctx.scoreSet(launch.x.set(0));
    ctx.scoreSet(launch.y.set(0));
    ctx.scoreSet(launch.z.set(0));

    ctx
      .execute()
      .ifScore(scratch.distSq, ">=", d.repo.ropeLenSqOf())
      .run((b) => b.call(d.fn.constrain));

    launch.clamp(d.consts.impulseMin, d.consts.impulseMax);
    d.motion.applyGlobal(ctx);
  }

  return {
    /** The tick-loop body: drive every grappling player, as + at each. */
    driveAll(ctx: FunctionContext): void {
      ctx.execute().as(d.selectors.grappling()).at(d.selectors.self()).run((b) => b.call(d.fn.drive));
    },
  };
}

/** The per-tick swing service - whatever {@link createSwingService} returns. */
export type SwingService = ReturnType<typeof createSwingService>;
