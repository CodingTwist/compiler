import { Range, Pos, Particle, Selector, EntityAnchor } from "helix";
import type { FunctionContext } from "helix";
import type {
  GrappleConfig,
  GrappleFunctions,
  GrappleSelectors,
  Scratch,
  StateRepository,
} from "./state";

/**
 * Rope particle. Redrawn every tick, so it must be short-lived and still, or old frames
 * smear.
 */
const ROPE_PARTICLE = Particle("electric_spark");

interface RopeDeps {
  scratch: Scratch;
  selectors: GrappleSelectors;
  repo: StateRepository;
  config: GrappleConfig;
  fn: GrappleFunctions;
}

/** Draws the visible rope as a line of particles from the hand to the anchor. */
export function createRopeService(d: RopeDeps) {
  const ropeStep = d.scratch.scalar("rope_step");

  // The recursive marcher: a particle, then step a block toward the anchor and recurse.
  // The step limit stops it if the aim is slightly off.
  d.fn.rope.build((ctx) => {
    ropeStep.remove(1);
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
     * Draws this player's rope for one tick. Run as and at the player.
     * Temporarily tags their anchor `grapple._aim` so `facing entity` can target it.
     */
    draw(ctx: FunctionContext): void {
      const ropeId = d.scratch.scalar("rope_id");

      ropeId.assign(d.repo.id.score(d.selectors.self()));
      ctx
        .execute()
        .as(d.selectors.anchors())
        .ifScore(d.repo.id.score(Selector.self()), "=", ropeId)
        .run((b) => b.tag().add(Selector.self(), "grapple._aim"));

      ropeStep.set(d.config.maxSteps);
      // Start at the hand (`^-0.4 ^-0.4 ^1`) so particles don't cover the first-person
      // view.
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
