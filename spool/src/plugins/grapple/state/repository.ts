// Per-player grapple state that survives between ticks.
import { Objective, Path, ScoreVec3, Selector } from "helix";
import type { FunctionContext } from "helix";
import type { PlayerMotion } from "../../player_motion";
import { POS_PER_BLOCK } from "../tuning";
import type { GrappleSelectors } from "./selectors";

interface StateRepositoryDeps {
  selectors: GrappleSelectors;
  motion: PlayerMotion;
}

/**
 * Per-player grapple state that survives between ticks: anchor, previous position,
 * velocity,
 * rope length² and id.
 */
export function createStateRepository(d: StateRepositoryDeps) {
  const self = d.selectors.self;

  // --- Persistent per-player objectives --------------------------------------
  const anchorX = new Objective("grapple.anchor_x");
  const anchorY = new Objective("grapple.anchor_y");
  const anchorZ = new Objective("grapple.anchor_z");
  const prevX = new Objective("grapple.prev_x");
  const prevY = new Objective("grapple.prev_y");
  const prevZ = new Objective("grapple.prev_z");
  // Last tick's velocity, stored so the release kick doesn't read `prev` after drive
  // overwrote it.
  const velX = new Objective("grapple.vel_x");
  const velY = new Objective("grapple.vel_y");
  const velZ = new Objective("grapple.vel_z");
  const ropeLenSq = new Objective("grapple.rope_len_sq");
  // Id shared by a player and their anchor, so stop can find the anchor by score
  // (multiplayer-safe).
  const id = new Objective("grapple.id");

  /** A `self`-bound vector over an [x, y, z] objective triple. */
  const selfVec = (o: readonly Objective[]) =>
    ScoreVec3.from((_, i) => o[i].score(self()));
  /** The anchor's world position (dm), as a `self`-bound vector. */
  const anchorVec = () => selfVec([anchorX, anchorY, anchorZ]);
  /** Last tick's player position (dm), as a `self`-bound vector. */
  const prevVec = () => selfVec([prevX, prevY, prevZ]);
  /** This player's last swing velocity, stored by drive, read by the release kick. */
  const velVec = () => selfVec([velX, velY, velZ]);
  /** This player's fixed rope length², the constraint gates on. */
  const ropeLenSqOf = () => ropeLenSq.score(self());
  /** player_motion's launch input, viewed as a vector the constraint writes into. */
  const launchVec = () =>
    new ScoreVec3(
      d.motion.launchInput.x,
      d.motion.launchInput.y,
      d.motion.launchInput.z,
    );

  /** Reads an entity's position into a vector in decimetres. */
  const readPos = (
    ctx: FunctionContext,
    who: Selector,
    into: ScoreVec3,
  ): void => {
    into.readEntity(who, Path.Entity.Pos, POS_PER_BLOCK, { ctx });
  };

  // The objectives `grapple/init` must create, in a stable order.
  const objectives = [
    anchorX,
    anchorY,
    anchorZ,
    prevX,
    prevY,
    prevZ,
    velX,
    velY,
    velZ,
    ropeLenSq,
    id,
  ];

  return {
    id,
    ropeLenSq,
    objectives,
    anchorVec,
    prevVec,
    velVec,
    ropeLenSqOf,
    launchVec,
    readPos,
  };
}

/** The persistent per-player state store - whatever {@link createStateRepository} returns. */
export type StateRepository = ReturnType<typeof createStateRepository>;
