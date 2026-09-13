// Grapple state: options, config, functions, selectors, scratch, constants, the per-player
// repository, anchor placement and init.
import { EntityAnchor, Id, Marker, Objective, Path, Pos, Range, ScoreTarget, ScoreVec3, Selector } from "helix";
import type { Block, Datapack, FunctionContext, FunctionRef, Nbt as NbtType } from "helix";
import type { PlayerMotion } from "../player_motion";
import {
  ANCHOR_TYPE,
  BAUMGARTE_DIV,
  BAUMGARTE_MAX,
  FRAC_SCALE,
  MAX_IMPULSE,
  MAX_STEPS,
  POS_PER_BLOCK,
  RADIAL_DAMP_DIV,
  RELEASE_KICK,
  RELEASE_KICK_MAX,
  SUSTAIN_DIV,
} from "./tuning";

/** A bound scoreboard slot - what `Objective.score(...)` yields. */
type Score = ReturnType<Objective["score"]>;

// --- config ---------------------------------------------------------------

/**
 * Options for {@link Datapack.grapple}. All optional.
 * The handle is cached per pack, so options from the first call win.
 */
export interface GrappleOptions {
  /**
   * Blocks a web can anchor to (a block id or `Block.tag(...)`). Default: any block.
   * The ray still stops at the first solid block; if it doesn't match, the grapple fizzles.
   */
  anchorOn?: Block;
  /** Maximum web reach in blocks (the raycast length). Default 50. */
  maxReach?: number;
}

/** Resolved config for one grapple install, so services don't re-derive values. */
export function createConfig(opts: GrappleOptions = {}) {
  // maxReach is in blocks; the marcher steps 0.5 blocks, so 2 steps per block.
  const maxSteps =
    opts.maxReach !== undefined ? Math.max(1, Math.round(opts.maxReach * 2)) : MAX_STEPS;

  return {
    /** The anchor block filter (or `undefined` = anchor on anything). */
    anchorOn: opts.anchorOn,
    /** Raycast reach in 0.5-block steps. */
    maxSteps,
    /** The invisible marker entity the anchor is (a position holder; no leash is drawable). */
    anchorType: ANCHOR_TYPE,
    /** Marker NBT: just the tags used to find it. */
    anchorNbt(): NbtType {
      return Marker({ tags: ["grapple.anchor", "grapple._new"] });
    },
  };
}

/** The resolved grapple config - whatever {@link createConfig} returns. */
export type GrappleConfig = ReturnType<typeof createConfig>;

// --- functions ------------------------------------------------------------

/**
 * Every function the plugin emits, created up front so bodies can reference each other.
 * The web raycast is the `raycast` plugin's function.
 */
export function createFunctions(dp: Datapack) {
  return {
    /** `grapple/init` (load) - create objectives + seed constants. */
    init: dp.createFunction("grapple/init", "load"),
    /** `grapple/start` - raycast an anchor and latch the player. Public. */
    start: dp.createFunction("grapple/start"),
    /** `grapple/drive` - one player's per-tick swing step. */
    drive: dp.createFunction("grapple/drive"),
    /** `grapple/constrain` - the taut-tick rope constraint. */
    constrain: dp.createFunction("grapple/constrain"),
    /** `grapple/rope` - the recursive particle-rope marcher. */
    rope: dp.createFunction("grapple/rope"),
    /** `grapple/tick` (tick) - drive every grappling player. */
    tick: dp.createFunction("grapple/tick", "tick"),
    /** `grapple/stop` - release the executing player. Public. */
    stop: dp.createFunction("grapple/stop"),
  } as const;
}

/** The grapple function table - whatever {@link createFunctions} returns. */
export type GrappleFunctions = ReturnType<typeof createFunctions>;

// --- selectors ------------------------------------------------------------

/** Every selector the plugin uses, named so services read as intent. */
export function createSelectors() {
  return {
    /** The executing player/entity (`@s`). */
    self: () => Selector.self(),
    /** Every player currently swinging (`@a[tag=grappling]`) - the drive-tick loop's subjects. */
    grappling: () => Selector.allPlayers().tag("grappling"),
    /** Every anchor marker in the world (`@e[tag=grapple.anchor]`). */
    anchors: () => Selector.allEntities().type(ANCHOR_TYPE).tag("grapple.anchor"),
    /** The just-summoned anchor. The tag is cleared at the end of `start`. */
    freshAnchor: () => Selector.allEntities().type(ANCHOR_TYPE).tag("grapple._new"),
    /** {@link freshAnchor}, limited to one (for reading a single marker's position). */
    freshAnchorOne: () => Selector.allEntities().type(ANCHOR_TYPE).tag("grapple._new").limit(1),
    /**
     * This player's anchor, tagged for the length of one `drive` so the rope can aim at it.
     */
    aimTarget: () => Selector.allEntities().type(ANCHOR_TYPE).tag("grapple._aim").limit(1),
    /**
     * Same anchor, but only when the marcher has reached it (within one step), which
     * ends the particle line.
     */
    aimReached: () =>
      Selector.allEntities().type(ANCHOR_TYPE).tag("grapple._aim").distance(new Range(undefined, 0.6)).limit(1),
  };
}

/** The grapple selector library - whatever {@link createSelectors} returns. */
export type GrappleSelectors = ReturnType<typeof createSelectors>;

// --- scratch --------------------------------------------------------------

/** Per-tick scratch scores on `grapple.work`; nothing here survives between ticks. */
export function createScratch() {
  const work = new Objective("grapple.work");
  const scalar = (name: string): Score => work.score(ScoreTarget(`#${name}`));
  const vector = (prefix: string): ScoreVec3 =>
    ScoreVec3.from((axis) => scalar(`${prefix}_${axis}`));
  return { work, scalar, vector };
}

/** The per-tick working-memory allocator - whatever {@link createScratch} returns. */
export type Scratch = ReturnType<typeof createScratch>;

/**
 * Every scratch slot one swing tick uses:
 *   pos      #pos_*       player position (decimetres)
 *   velocity #vel_*       pos − prev
 *   toAnchor #to_anchor_* r = anchor − pos
 *   radVec   #rad_*       radial part of velocity
 *   distSq   #dist_sq     |r|²
 *   dot      #dot         v · r
 *   coef/frac/fracRad     constraint intermediates
 */
export function swingScratch(scratch: Scratch) {
  return {
    pos: scratch.vector("pos"),
    velocity: scratch.vector("vel"),
    toAnchor: scratch.vector("to_anchor"),
    radVec: scratch.vector("rad"),
    distSq: scratch.scalar("dist_sq"),
    dot: scratch.scalar("dot"),
    coef: scratch.scalar("coef"),
    frac: scratch.scalar("frac"),
    fracRad: scratch.scalar("frac_rad"),
  };
}
export type SwingScratch = ReturnType<typeof swingScratch>;

// --- constants ------------------------------------------------------------

/**
 * Load-time constants on `grapple.const`, seeded by `grapple/init` from `tuning.ts`.
 * `nextId` isn't in `seeds`: it's a persistent counter seeded once.
 */
export function createConstants() {
  const objective = new Objective("grapple.const");
  const score = (name: string): Score => objective.score(ScoreTarget(`#${name}`));

  const fracScale = score("frac_scale");
  const nextId = score("next_id");
  const baumDiv = score("baum_div");
  const baumMax = score("baum_max");
  const sustainDiv = score("sustain_div");
  const radialDampDiv = score("radial_damp_div");
  const releaseKick = score("release_kick");
  const releaseKickMax = score("release_kick_max");
  const impulseMax = score("impulse_max");
  const impulseMin = score("impulse_min");

  // Kept in a stable order so init output is predictable. `nextId` is seeded separately.
  const seeds: readonly [Score, number][] = [
    [fracScale, FRAC_SCALE],
    [baumDiv, BAUMGARTE_DIV],
    [baumMax, BAUMGARTE_MAX],
    [sustainDiv, SUSTAIN_DIV],
    [radialDampDiv, RADIAL_DAMP_DIV],
    [releaseKick, RELEASE_KICK],
    [releaseKickMax, RELEASE_KICK_MAX],
    [impulseMax, MAX_IMPULSE],
    [impulseMin, -MAX_IMPULSE],
  ];

  return {
    objective,
    seeds,
    fracScale, nextId, baumDiv, baumMax, sustainDiv,
    radialDampDiv, releaseKick, releaseKickMax, impulseMax, impulseMin,
  };
}

/** The load-time constants table - whatever {@link createConstants} returns. */
export type Constants = ReturnType<typeof createConstants>;

// --- state.repository -----------------------------------------------------

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
    new ScoreVec3(d.motion.launchInput.x, d.motion.launchInput.y, d.motion.launchInput.z);

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

// --- anchor.service -------------------------------------------------------

interface AnchorDeps {
  config: GrappleConfig;
  selectors: GrappleSelectors;
  repo: StateRepository;
}

/**
 * Runs at the block the web hits: summons the anchor marker and stores its position.
 * Block filtering happens in the raycast, so this always summons.
 */
export function createAnchorService(d: AnchorDeps) {
  return {
    /** Places the anchor here and records it in this player's scores. */
    place(ctx: FunctionContext): void {
      ctx.summon(d.config.anchorType, Pos.here(), d.config.anchorNbt());
      d.repo.readPos(ctx, d.selectors.freshAnchorOne(), d.repo.anchorVec());
    },
  };
}

/** The anchor-placement service - whatever {@link createAnchorService} returns. */
export type AnchorService = ReturnType<typeof createAnchorService>;

// --- init -----------------------------------------------------------------

interface InitDeps {
  fn: GrappleFunctions;
  scratch: Scratch;
  repo: StateRepository;
  consts: Constants;
}

/** `grapple/init` (load): creates objectives and seeds constants from `tuning.ts`. */
export function defineInit(d: InitDeps): void {
  d.fn.init.build((ctx) => {
    const objectives = [d.scratch.work, d.consts.objective, ...d.repo.objectives];
    for (const o of objectives) ctx.scoreInit(o);

    for (const [score, value] of d.consts.seeds) score.set(value);

    // Only seed the id counter if unset; reloads must not reset live anchors' ids.
    ctx
      .execute()
      .unlessScore(d.consts.nextId, "=", d.consts.nextId)
      .run((b) => d.consts.nextId.set(0));
  });
}
