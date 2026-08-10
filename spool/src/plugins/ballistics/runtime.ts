import {
  Datapack,
  Double,
  EntityType,
  Nbt,
  NbtPath,
  Pos,
  Range,
  ScoreTarget,
  ScoreVec3,
  Selector,
  Short,
} from "helix";
import type {
  FunctionContext,
  FunctionRef,
  NbtInput,
  Objective,
  Score,
} from "helix";
import {
  MOTION_AXIS_LIMIT,
  PROJECTILES,
  trajectoryBasis,
  type ProjectileProfile,
} from "./physics";

/**
 * **The runtime half of `ballistics`: aim at a target that moves.**
 *
 * `ctx.ballistic()` solves at build time, so both endpoints are frozen into the emitted
 * `/summon`. This one solves **in game, every shot**, off two entities' live positions -
 * move the target and the next shot follows it.
 *
 * It can do that cheaply because of the affine structure `physics.ts` describes: once a
 * flight time `n` is fixed, the launch velocity is *one division*, not a search:
 *
 * ```
 *   v = (target - launcher - ĵ·G(n)) / A(n)
 * ```
 *
 * `A(n)` and `G(n)` are constants of the projectile, computed here at build time and
 * baked into the function as scoreboard constants. What runs in game is only: read six
 * coordinates, subtract, scale, divide, write `Motion`. No iteration, no macros.
 *
 * The defaults are the common case - **`@s` throws at `@p`** - so a mob artillery piece is
 * just `execute as @e[type=blaze] run function <ns>:throw`.
 *
 * **The function returns `1` if it fired and `0` if it refused**, so the caller can react:
 * `execute as @s run function ns:throw` under an `execute if function` branch, an
 * animation on success, a different attack on failure. It refuses when the required
 * `Motion` exceeds vanilla's +/-10 b/t per axis, which vanilla *zeroes* rather than clamps
 * - i.e. would drop live TNT on the thrower. That refusal doubles as the range check.
 *
 * **The trade against the compile-time solver:** `n` is fixed at build time, so this
 * picks the arc that arrives in exactly `ticks` ticks rather than searching the family of
 * exact solutions for the min-speed / min-time / pitch-constrained one. Every option in
 * `LaunchOptions` that *selects among flight times* therefore has no meaning here - a
 * shorter `ticks` is a flatter, faster shot, a longer one a higher lob, and that is the
 * whole aiming vocabulary. The shot is still exact for the `n` you name.
 *
 * ## Precision
 *
 * Positions are read in centi-blocks (`data get … 100`) and velocities held as
 * `1e-4` blocks/tick, which is what keeps the intermediate `d·10000` inside a 32-bit
 * score for targets out to ~2000 blocks. The resulting quantisation is ~0.003 blocks of
 * landing error, plus ~0.04 % of range from rounding `A(n)` to centi-precision - a few
 * centimetres at 100 blocks, well inside a TNT blast.
 */
export interface RuntimeShotOptions {
  /** Who throws it. Default `@s` - so the function is called *as* the thrower. */
  readonly from?: Selector;
  /** What to hit. Default `@p` - the thrower's nearest player. */
  readonly to?: Selector;
  /**
   * Flight time in ticks - the one aiming knob (see above). Default `40`. Also the TNT
   * `fuse`, so the shot airbursts on the target.
   */
  readonly ticks?: number;
  /**
   * Aim where the target *will be*, not where it is: adds `velocity × ticks` to the
   * target point. Off by default because it costs a per-tick tracker.
   *
   * A player standing still is hit either way; a player sprinting is ~0.28 blocks/tick,
   * so a 40-tick lob lands 11 blocks behind them without this. The tracker diffs a
   * player's position against last tick's - **players only**, so a non-player target
   * simply gets no lead (its velocity scores stay 0). Shared by every shot in the pack,
   * emitted once.
   *
   * Firing at someone enrols them, and they drop out {@link TRACK_TTL} ticks after the
   * last shot, so the per-tick cost is one function per player *currently under fire*
   * rather than one per player online. Re-enrolment reseeds the previous position, so a
   * player who left the set and travelled cannot produce a garbage first sample.
   */
  readonly lead?: boolean;
  /** Which entity to fire. Default {@link PROJECTILES.tnt}. */
  readonly projectile?: ProjectileProfile;
  /** Override the fuse, or `false` to leave the vanilla one (it lands instead of airbursting). */
  readonly fuse?: number | false;
  /** Extra NBT merged into the summon. */
  readonly nbt?: Record<string, NbtInput>;
}

/** 1.21.5 renamed `Fuse` -> `fuse`; see the note in `index.ts`. */
const TNT_SNAKE_NBT_DATA_VERSION = 4325;

/** Positions are read as centi-blocks, velocities held as 1e-4 blocks/tick. See above. */
const POS_SCALE = 100;
const V_SCALE = 10000;

const OBJECTIVE = "ballistics";
const AXES = ["x", "y", "z"] as const;
type Axis = (typeof AXES)[number];

/** A `ScoreVec3` from a per-axis score, so no vector is ever spelled out three times. */
const scoreVec = (of: (axis: Axis, index: number) => Score) =>
  new ScoreVec3(of("x", 0), of("y", 1), of("z", 2));

/** Players currently being diffed. Enrolment is by shot, not by being online. */
const TRACK_TAG = "ballistics.tracked";
/**
 * Ticks a target stays enrolled after the last shot at it. Long enough to span any
 * sane reload cooldown, so a sustained engagement never falls back to a cold sample.
 */
const TRACK_TTL = 200;

/**
 * `store result score` each axis of `who`'s `Pos` (centi-blocks) into `into`. The one
 * place the `Pos[i]` NBT layout is spelled out; everything downstream is vector algebra.
 */
function readPos(
  ctx: FunctionContext,
  who: Selector,
  into: ScoreVec3,
  at?: Selector,
): void {
  into.components.forEach((score, axis) => {
    const chain = ctx.execute();
    if (at) chain.at(at);
    chain
      .storeResultScore(score)
      .run((c) => c.entity(who).get(NbtPath(`Pos[${axis}]`), POS_SCALE));
  });
}

interface Tracker {
  /** Per-axis velocity in centi-blocks/tick, keyed by player. */
  readonly vel: Objective[];
  /** Run *as* a target to (re)enrol it. Idempotent; refreshes the TTL. */
  readonly enroll: FunctionRef;
}

/** Emitted at most once per datapack, however many shots ask for `lead`. */
const trackers = new WeakMap<Datapack, Tracker>();

function targetVelocity(dp: Datapack): Tracker {
  const existing = trackers.get(dp);
  if (existing) return existing;

  const vel = AXES.map((a) => dp.objective(`${OBJECTIVE}.v${a}`));
  const prev = AXES.map((a) => dp.objective(`${OBJECTIVE}.p${a}`));
  const ttl = dp.objective(`${OBJECTIVE}.ttl`);
  const me = () => Selector.self();
  /** The three objectives as one `@s`-bound vector. */
  const vec = (o: Objective[]) => scoreVec((_, i) => o[i].score(me()));

  // Cold start: seed `prev` from the current position and zero the velocity. Without
  // this, a player who dropped out of the set, walked 500 blocks and got re-enrolled
  // would diff against where they left off and the next shell would aim at the moon.
  const init = dp.createFunction("zzz/track_init");
  init.build((ctx) => {
    readPos(ctx, me(), vec(prev));
    for (const axis of vec(vel).components) axis.set(0, ctx);
  });

  const enroll = dp.createFunction("zzz/track_enroll");
  enroll.build((ctx) => {
    ctx
      .execute()
      .unlessEntity(me().tag(TRACK_TAG))
      .run((c) => c.call(init));
    ctx.tag().add(me(), TRACK_TAG);
    ttl.score(me()).set(TRACK_TTL, ctx);
  });

  const track = dp.createFunction("zzz/track_targets");
  track.build((ctx) => {
    // v = now - then, *then* then = now. Order matters: the subtract has to see last
    // tick's value before it is overwritten.
    const v = vec(vel);
    const then = vec(prev);
    readPos(ctx, me(), v);
    v.sub(then, ctx);
    readPos(ctx, me(), then);
    // Nobody has shot at them in a while - stop paying for them.
    const left = ttl.score(me());
    left.remove(1, ctx);
    ctx
      .execute()
      .ifScoreMatches(left, new Range(undefined, 0))
      .run((c) => c.tag().remove(me(), TRACK_TAG));
  });
  dp.tick((ctx) =>
    ctx
      .execute()
      .as(Selector.allPlayers().tag(TRACK_TAG))
      .run((c) => c.call(track)),
  );

  const tracker: Tracker = { vel, enroll };
  trackers.set(dp, tracker);
  return tracker;
}

export function defineRuntimeShot(
  dp: Datapack,
  name: string,
  opts: RuntimeShotOptions = {},
): FunctionRef {
  const from = opts.from ?? Selector.self();
  const to = opts.to ?? Selector.nearest();
  const profile = opts.projectile ?? PROJECTILES.tnt;
  const ticks = Math.round(opts.ticks ?? 40);
  if (ticks < 1)
    throw new Error(`ballistics: ticks must be >= 1, got ${ticks}.`);

  // The same basis the compile-time solver inverts - sampled at the one chosen tick.
  const { A, G } = trajectoryBasis(profile, ticks);
  const aFixed = Math.round(A[ticks] * POS_SCALE);
  const gFixed = Math.round(G[ticks] * POS_SCALE);
  if (aFixed <= 0)
    throw new Error(
      `ballistics: A(${ticks}) is not positive - no shot exists.`,
    );

  const obj = dp.objective(OBJECTIVE);
  const slot = (holder: string): Score => obj.score(ScoreTarget(holder));
  /** The launch velocity being solved for, and a scratch point to build it from. */
  const v = scoreVec((a) => slot(`#v${a}`));
  const p = scoreVec((a) => slot(`#p${a}`));
  const kScale = slot("#v_scale");
  const kA = slot("#a");
  const kTicks = slot("#ticks");

  // Velocity objectives read against the *target* - one row per tracked player.
  const tracker = opts.lead ? targetVelocity(dp) : undefined;
  const lead =
    tracker && scoreVec((_, i) => tracker.vel[i].score(ScoreTarget(to)));

  const fuseKey =
    dp.version.dataVersion >= TNT_SNAKE_NBT_DATA_VERSION ? "fuse" : "Fuse";
  const fuse =
    opts.fuse === false || profile.defaultFuse === undefined
      ? undefined
      : (opts.fuse ?? ticks);
  const shotTag = `${dp.name}.shot`;
  // Rebuilt per use: Selector builders mutate in place, so one shared instance would
  // leak its filters into every clause it appears in.
  const shot = () => Selector.allEntities().tag(shotTag).limit(1);

  const fn = dp.createFunction(name);
  fn.build((ctx) => {
    kScale.set(V_SCALE, ctx);
    kA.set(aFixed, ctx);
    if (tracker) {
      kTicks.set(ticks, ctx);
      // Shooting at someone is what enrols them, so the tick loop only pays for players
      // actually under fire. `at from` first so `to` resolves from the thrower.
      // ponytail: the opening shell of an engagement is therefore unled - the sample is
      // one tick old at best. Call `enroll` from wherever you acquire the target if that
      // first shot needs to lead too.
      ctx
        .execute()
        .at(from)
        .as(to)
        .run((c) => c.call(tracker.enroll));
    }

    // `at from` so the *target* selector resolves from the thrower: `@p` means its
    // nearest player, and any `limit=1` sorts from it, not from wherever the caller
    // happened to be standing (a `tick`-tagged function runs at the world origin).
    readPos(ctx, to, v, from);
    // Where they'll be in `ticks` ticks, at their current velocity.
    if (lead) {
      // `at from` again - the velocity is read off the same entity `to` just resolved to.
      lead.components.forEach((vel, axis) =>
        ctx
          .execute()
          .at(from)
          .run((c) => p.components[axis].assign(vel, c)),
      );
      p.scale(kTicks, ctx);
      v.add(p, ctx);
    }
    readPos(ctx, from, p);
    v.sub(p, ctx);
    // Vertical only: take the gravity drop out before dividing (`v_y = (dy - G)/A`).
    // `scoreboard players add/remove` take a non-negative literal, so pick the verb.
    if (gFixed > 0) v.y.remove(gFixed, ctx);
    else if (gFixed < 0) v.y.add(-gFixed, ctx);
    // d(centi) * 10000 / A(centi) = v * 10000. Multiply first: the divide is integer,
    // and dividing a centi-block displacement by A directly would floor most of it away.
    v.scale(kScale, ctx).divide(kA, ctx);

    // Vanilla *zeroes* a Motion axis past +/-10 rather than clamping it, which would drop
    // the shot on the thrower's head. Bail out instead; `0` tells the caller it held fire.
    const limit = MOTION_AXIS_LIMIT * V_SCALE;
    for (const axis of v.components) {
      ctx
        .execute()
        .unlessScoreMatches(axis, new Range(-limit, limit))
        .run((c) => c.return_(0));
    }

    ctx
      .execute()
      .at(from)
      .run((at) =>
        at.summon(
          EntityType(profile.id),
          Pos.here(),
          Nbt({
            ...(fuse === undefined ? {} : { [fuseKey]: Short(fuse) }),
            // Doubles, and present up front: `store … entity Motion[i]` needs the
            // list to exist, and a float list would read back as zeroes.
            Motion: [Double(0), Double(0), Double(0)],
            Tags: [shotTag],
            ...opts.nbt,
          }),
        ),
      );
    v.components.forEach((axisVel, axis) =>
      ctx
        .execute()
        .storeResultEntity(
          shot(),
          NbtPath(`Motion[${axis}]`),
          "double",
          1 / V_SCALE,
        )
        .run((s) => s.scoreGet(axisVel)),
    );
    ctx.tag().remove(shot(), shotTag);
    ctx.return_(1);
  });
  return fn;
}
