import { Objective, ScoreVec3, NbtPath } from "helix";
import type { FunctionContext, Selector } from "helix";
import type { PlayerMotion } from "../player_motion";
import { POS_PER_BLOCK } from "./tuning";
import type { GrappleSelectors } from "./selectors";

/** A bound scoreboard slot - what `Objective.score(...)` yields. */
type Score = ReturnType<Objective["score"]>;

interface StateRepositoryDeps {
  selectors: GrappleSelectors;
  motion: PlayerMotion;
}

/**
 * The **repository**: the plugin's persistent, per-player state - the scoreboard row for
 * each swinging player. It owns the state objectives (anchor / prev-pos / stored-velocity
 * / rope-length² / grapple-id), hands them out as `self`-bound {@link ScoreVec3} views the
 * physics reads and writes, and is the **single owner** of the raw `Pos[]` entity-NBT
 * layout (via {@link readPos}). Everything transient (this-tick scratch) lives elsewhere;
 * this is only what must survive from one tick to the next.
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
  // The player's last measured swing velocity (pos − prev), stored per-tick by drive so the
  // release kick can read it *without* racing prev (which drive overwrites every tick).
  const velX = new Objective("grapple.vel_x");
  const velY = new Objective("grapple.vel_y");
  const velZ = new Objective("grapple.vel_z");
  const ropeLenSq = new Objective("grapple.rope_len_sq");
  // A per-grapple id shared by a player and their anchor pair, so stop can find *this*
  // player's anchor by scoreboard compare alone (no macros, multiplayer-safe).
  const id = new Objective("grapple.id");

  /** The anchor's world position (dm), as a `self`-bound vector. */
  const anchorVec = () =>
    new ScoreVec3(anchorX.score(self()), anchorY.score(self()), anchorZ.score(self()));
  /** Last tick's player position (dm), as a `self`-bound vector. */
  const prevVec = () =>
    new ScoreVec3(prevX.score(self()), prevY.score(self()), prevZ.score(self()));
  /** This player's last swing velocity, stored by drive, read by the release kick. */
  const velVec = () =>
    new ScoreVec3(velX.score(self()), velY.score(self()), velZ.score(self()));
  /** This player's fixed rope length², the constraint gates on. */
  const ropeLenSqOf = () => ropeLenSq.score(self());
  /** player_motion's launch input, viewed as a vector the constraint writes into. */
  const launchVec = () =>
    new ScoreVec3(d.motion.launchInput.x, d.motion.launchInput.y, d.motion.launchInput.z);

  /**
   * Read an entity's world position into three scores as fixed-point decimetres (the
   * {@link POS_PER_BLOCK} scale). The **single place** that knows the `Pos[]` entity
   * layout, so that raw Minecraft NBT knowledge isn't sprayed across the services. Works
   * on any builder context (a `fn.build`'s or a nested `.run`'s).
   */
  const readPos = (
    ctx: FunctionContext,
    who: Selector,
    into: readonly [Score, Score, Score],
  ): void => {
    into.forEach((score, axis) => {
      ctx
        .execute()
        .storeResultScore(score)
        .run((b) => b.entity(who).get(NbtPath(`Pos[${axis}]`), POS_PER_BLOCK));
    });
  };

  // The objectives `grapple/init` must create, in a stable order.
  const objectives = [
    anchorX, anchorY, anchorZ,
    prevX, prevY, prevZ,
    velX, velY, velZ,
    ropeLenSq, id,
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
