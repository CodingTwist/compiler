import type { FunctionContext } from "helix";
import { DEBUG, LOG } from "./tuning";
import { senseSwingState, solveConstraint } from "./physics";
import type { PlayerMotion } from "../player_motion";
import type { DebugService } from "./debug.service";
import type { RopeService } from "./rope.service";
import { swingScratch } from "./state";
import type {
  Constants,
  GrappleFunctions,
  GrappleSelectors,
  Scratch,
  StateRepository,
} from "./state";

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
 * The per-tick pendulum: `drive` (one player) and `constrain` (taut rope
 * solve).
 */
export function createSwingService(d: SwingDeps) {
  const scratch = swingScratch(d.scratch);

  // drive - one grappling player's per-tick swing step (run as + at them).
  d.fn.drive.build((ctx) => {
    senseSwingState(d, scratch, ctx); // position, velocity, vector-to-anchor, dist²/dot

    if (DEBUG) d.debug.readout(scratch, ctx);
    if (LOG) d.debug.log(scratch, ctx);

    applyRopeImpulse(ctx); // rope correction → player_motion, if taut

    d.rope.draw(ctx); // the visible particle line
  });

  // constrain - the rigid-rope constraint for one taut tick (see physics).
  d.fn.constrain.build(() => solveConstraint(d, scratch));

  /**
   * Builds and fires this tick's launch impulse. `applyGlobal` adds to velocity, so:
   *
   * - Start at zero, so a slack tick leaves the player to gravity.
   * - When taut (dist² ≥ ropeLen²), `constrain` writes the rope correction. Gate on
   *   distance only, since the position trim must still run while moving inward.
   * - Clamp per axis to cap the first yank, then sustain the impulse.
   */
  function applyRopeImpulse(ctx: FunctionContext): void {
    const launch = d.repo.launchVec();

    launch.x.set(0);
    launch.y.set(0);
    launch.z.set(0);

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
      ctx
        .execute()
        .as(d.selectors.grappling())
        .at(d.selectors.self())
        .run((b) => b.call(d.fn.drive));
    },
  };
}

/** The per-tick swing service - whatever {@link createSwingService} returns. */
export type SwingService = ReturnType<typeof createSwingService>;
