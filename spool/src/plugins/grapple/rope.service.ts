import { Range, Pos, Particle, Selector, EntityAnchor } from "helix";
import type { FunctionContext } from "helix";
import type { GrappleConfig, GrappleFunctions, GrappleSelectors, Scratch, StateRepository } from "./state";

/**
 * Particle the rope is drawn from. We redraw the whole line every tick, so the particle
 * must be **short-lived and near-stationary** - otherwise old frames drift off and smear
 * into a cloud (which `end_rod`, floating up over ~3s, did). A short, low-drift spark just
 * refreshes in place each tick and vanishes on release. Kept option-less so it stays a
 * typed `Particle` (no SNBT).
 */
const ROPE_PARTICLE = Particle("electric_spark");

interface RopeDeps {
  scratch: Scratch;
  selectors: GrappleSelectors;
  repo: StateRepository;
  config: GrappleConfig;
  fn: GrappleFunctions;
}

/**
 * The **rope service**: the *visible* rope. A real leash can't be drawn by command, so we
 * march short-lived particles from the player's hand to the anchor instead (no reach cap,
 * always renders). The factory builds the recursive marcher (`grapple/rope`); {@link RopeService.draw}
 * (called each tick by the swing service) aims and fires it for one player.
 */
export function createRopeService(d: RopeDeps) {
  const ropeStep = d.scratch.scalar("rope_step");

  // Build the recursive marcher: one particle here, then - while steps remain and the anchor
  // isn't reached - step a full block along ^ (still pointed at the anchor) and recurse. A
  // 1-block spacing keeps the rope readable without flooding the view. The step guard bounds
  // the recursion to the rope's max length even if the aim is slightly off.
  d.fn.rope.build((ctx) => {
    ctx.scoreRemove(ropeStep.remove(1));
    ctx.particle(ROPE_PARTICLE, Pos.here(), Pos(0, 0, 0), 0, 1);
    ctx
      .execute()
      .ifScoreMatches(ropeStep, new Range(1, undefined))
      .unlessEntity(d.selectors.aimReached())
      .positioned(Pos.local(0, 0, 1))
      .run((b) => b.returnRun((r) => r.call(d.fn.rope)));
  });

  return {
    /**
     * Draw this player's rope for one tick (run **as + at** the player). Tag exactly *this*
     * player's anchor `grapple._aim` (matched by the shared grapple id, so `facing entity` /
     * the arrival check can name it - we run per player, so only one is tagged at a time),
     * then start the marcher at the *hand* and aim it at the anchor, and finally untag.
     */
    draw(ctx: FunctionContext): void {
      const ropeId = d.scratch.scalar("rope_id");

      ropeId.assign(d.repo.id.score(d.selectors.self()));
      ctx
        .execute()
        .as(d.selectors.anchors())
        .ifScore(d.repo.id.score(Selector.self()), "=", ropeId)
        .run((b) => b.tag().add(Selector.self(), "grapple._aim"));

      ctx.scoreSet(ropeStep.set(d.config.maxSteps));
      // Start at the *hand*, not the eyes: offset down-right and a block forward
      // (`^-0.4 ^-0.4 ^1`) so the near end clears the first-person camera instead of
      // smearing particles across the view. Then re-aim ^ at the anchor and hand off.
      ctx
        .execute()
        .anchored(EntityAnchor.EYES)
        .positioned(Pos.local(-0.4, -0.4, 1))
        .facingEntity(d.selectors.aimTarget(), EntityAnchor.FEET)
        .run((b) => b.call(d.fn.rope));
      ctx.tag().remove(d.selectors.aimTarget(), "grapple._aim");
    },
  };
}

/** The visible-rope service - whatever {@link createRopeService} returns. */
export type RopeService = ReturnType<typeof createRopeService>;
