// The grapple plugin's **state layer**: options + resolved config, the function
// table, the selector library, per-tick scratch, load-time constants, the
// persistent per-player repository, the anchor placement, and the `init` body.
//
// One file rather than eight: each of these is a single factory with a single
// caller (the module in grapple.module.ts), and splitting them cost more import
// ceremony than it bought. The *behaviour* still lives in its own services
// (attach / swing / release / rope / debug) and the physics in physics.ts.
import { EntityAnchor, Id, Nbt, Objective, Path, Pos, Range, ScoreTarget, ScoreVec3, Selector } from "helix";
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
 * Author-facing knobs for {@link Datapack.grapple}. All optional - the bare
 * `dp.grapple()` reproduces the original behaviour (anchor on any solid block,
 * 50-block reach). The handle is cached per `Datapack`, so the options passed to
 * the **first** `dp.grapple(...)` call win; later calls return that same handle.
 */
export interface GrappleOptions {
  /**
   * Restrict which blocks a web can anchor to (a block id, or a tag via
   * `Block.tag("logs")`). The raycast still stops at the first solid block;
   * if that block doesn't match, the grapple simply fizzles (no anchor, no tag)
   * instead of latching. Default: anchor on anything the ray hits.
   */
  anchorOn?: Block;
  /** Maximum web reach in blocks (the raycast length). Default 50. */
  maxReach?: number;
}

/**
 * The resolved, immutable **config** for one grapple install - the `GrappleOptions`
 * turned into the concrete values the rest of the plugin reads (the raycast reach in
 * steps, the anchor block filter, the marker's entity type + NBT). One small
 * value-bag so no service re-derives `maxReach * 2` or re-hand-writes the marker tags.
 */
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
    /**
     * NBT for the marker anchor - just the tags that find it later (structured, not a
     * hand-built SNBT string, so it renders through helix's serializer).
     */
    anchorNbt(): NbtType {
      return Nbt({ Tags: ["grapple.anchor", "grapple._new"] });
    },
  };
}

/** The resolved grapple config - whatever {@link createConfig} returns. */
export type GrappleConfig = ReturnType<typeof createConfig>;

// --- functions ------------------------------------------------------------

/**
 * The grapple function table: every `.mcfunction` the plugin emits, created **up front**
 * so any body can reference any other before the bodies are filled (the controller builds
 * `start`/`tick`/`stop`; the services build their own internals). `init` is `load`-tagged
 * and `tick` is `tick`-tagged; the rest are plain. The web raycast is *not* here - it's the
 * `raycast` plugin's own function (`raycast/grapple/web`).
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

/**
 * The grapple **selector library**: every `@s`/`@e[...]` query the plugin makes, named
 * once so the services read as intent (`selectors.grappling()`, `selectors.freshAnchor()`)
 * instead of re-spelling tag filters. Pure query builders - no state, no scoreboard.
 */
export function createSelectors() {
  return {
    /** The executing player/entity (`@s`). */
    self: () => Selector.self(),
    /** Every player currently swinging (`@a[tag=grappling]`) - the drive-tick loop's subjects. */
    grappling: () => Selector.allPlayers().tag("grappling"),
    /** Every anchor marker in the world (`@e[tag=grapple.anchor]`). */
    anchors: () => Selector.allEntities().tag("grapple.anchor"),
    /**
     * The anchor's transient per-summon handle (`grapple._new`, cleared at the end of
     * `start`, so it only ever matches the just-summoned marker).
     */
    freshAnchor: () => Selector.allEntities().tag("grapple._new"),
    /** {@link freshAnchor}, limited to one (for reading a single marker's position). */
    freshAnchorOne: () => Selector.allEntities().tag("grapple._new").limit(1),
    /**
     * The rope's per-tick aim target: the executing player's own anchor, transiently
     * tagged `grapple._aim` for the duration of one `drive` so `facing entity` and the
     * arrival check can name exactly it (drive runs per player, so only one is tagged).
     */
    aimTarget: () => Selector.allEntities().tag("grapple._aim").limit(1),
    /**
     * Same anchor, but only when the marcher has reached it (within one step), which
     * ends the particle line.
     */
    aimReached: () =>
      Selector.allEntities().tag("grapple._aim").distance(new Range(undefined, 0.6)).limit(1),
  };
}

/** The grapple selector library - whatever {@link createSelectors} returns. */
export type GrappleSelectors = ReturnType<typeof createSelectors>;

// --- scratch --------------------------------------------------------------

/**
 * The per-tick **working memory**: the `grapple.work` objective plus the two factories
 * that carve transient `#name` slots out of it - `scalar("dist_sq")` for one score,
 * `vector("vel")` for a `#vel_x/#vel_y/#vel_z` {@link ScoreVec3}. These are scribble
 * space the swing math overwrites every tick; nothing here survives between ticks (that's
 * the repository). Kept separate so "scratch" and "persistent state" never blur together.
 */
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
 * All the scratch slots one swing tick's math uses, allocated once. Named here so every
 * physics helper agrees on the slots:
 *   pos      #pos_*       the player's position this tick (decimetres)
 *   velocity #vel_*       pos − prev (the player's real displacement last tick)
 *   toAnchor #to_anchor_* r = anchor − pos
 *   radVec   #rad_*       the radial slice of velocity, as a vector
 *   tangVec  #tang_*      the tangential slice of velocity, as a vector
 *   distSq   #dist_sq     |r|²
 *   dot      #dot         v · r
 *   cross    #cross       cross-term temp for the dot products
 *   coef/baum/frac/fracRad the constraint's intermediate scalars
 */
export function swingScratch(scratch: Scratch) {
  return {
    pos: scratch.vector("pos"),
    velocity: scratch.vector("vel"),
    toAnchor: scratch.vector("to_anchor"),
    radVec: scratch.vector("rad"),
    tangVec: scratch.vector("tang"),
    distSq: scratch.scalar("dist_sq"),
    dot: scratch.scalar("dot"),
    cross: scratch.scalar("cross"),
    coef: scratch.scalar("coef"),
    baum: scratch.scalar("baum"),
    frac: scratch.scalar("frac"),
    fracRad: scratch.scalar("frac_rad"),
  };
}
export type SwingScratch = ReturnType<typeof swingScratch>;

// --- constants ------------------------------------------------------------

/**
 * The load-time **constants** the pendulum math multiplies by: the `#…` slots on
 * `grapple.const`, plus the {@link seeds} table `grapple/init` writes them from (each
 * `[slot, value]` sourced from `tuning.ts`). The one place a tuning knob becomes a live
 * score. `nextId` is deliberately **not** in `seeds` - it's a persistent counter seeded
 * once, conditionally, by init (never clobbered on reload).
 */
export function createConstants() {
  const objective = new Objective("grapple.const");
  const score = (name: string): Score => objective.score(ScoreTarget(`#${name}`));

  const negOne = score("neg_one");
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

  // Seed order is the order `grapple/init` emits (kept stable so the rendered init is
  // predictable). `nextId` is omitted - init seeds it conditionally, not in this loop.
  const seeds: readonly [Score, number][] = [
    [negOne, -1],
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
    negOne, fracScale, nextId, baumDiv, baumMax, sustainDiv,
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

  /**
   * Read an entity's world position into a vector as fixed-point decimetres. helix's
   * {@link ScoreVec3.readEntity} owns the `Pos[]` layout; the **one** thing the repository
   * still owns is the {@link POS_PER_BLOCK} scale every stored position is held at. Works
   * on any builder context (a `fn.build`'s or a nested `.run`'s).
   */
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
 * The **anchor service**: what happens *at the block the web hits* - it's the `onHit`
 * payload handed to the `raycast` plugin. Summon the invisible marker there (the anchor a
 * leash can't be, so a position holder the rope + constraint reference by id) and read its
 * world position into the player's anchor scores. The block *filter* (`config.anchorOn`) is
 * the raycast's job now, so a disallowed block never calls this at all - hence the summon is
 * unconditional here.
 */
export function createAnchorService(d: AnchorDeps) {
  return {
    /**
     * Place the anchor at the current (hit) position and record it. Runs `at` the player
     * (the raycast preserves `@s`), so `repo.anchorVec()` writes into *this* player's anchor
     * scores.
     */
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

/**
 * `grapple/init` (load-tagged): create every objective the plugin uses (scratch, constants,
 * and the repository's per-player state) and seed the constants the pendulum math multiplies
 * by (from the `consts.seeds` table, itself sourced from `tuning.ts`). The grapple-id counter
 * is the one exception - it persists across the run, so it's seeded once, conditionally.
 */
export function defineInit(d: InitDeps): void {
  d.fn.init.build((ctx) => {
    const objectives = [d.scratch.work, d.consts.objective, ...d.repo.objectives];
    for (const o of objectives) ctx.scoreInit(o);

    for (const [score, value] of d.consts.seeds) ctx.scoreSet(score.set(value));

    // The grapple-id counter persists across the run; only seed it if unset (load runs on
    // every reload, and we must not reset live anchors' ids to 0). A score compared to itself
    // fails when it has no value, so `unless` fires exactly once.
    ctx
      .execute()
      .unlessScore(d.consts.nextId, "=", d.consts.nextId)
      .run((b) => b.scoreSet(d.consts.nextId.set(0)));
  });
}
