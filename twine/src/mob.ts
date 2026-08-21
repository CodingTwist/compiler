import {
  NbtPath,
  Nbt,
  Pos,
  Range,
  Relation,
  ScoreTarget,
  Selector,
  add,
  displayPose,
  mulQuat,
  rotateAboutPivot,
  round6,
} from "helix";
import type {
  DamageType,
  Datapack,
  Detector,
  DisplayValue,
  FunctionContext,
  FunctionRef,
  Id,
  IdentifiedEntityNbt,
  Objective,
  Quat,
  Transform,
  Vec3,
} from "helix";
import type { ConfiguredModule, DatapackModule, ModuleScope } from "./module.interface";
import { defineModule } from "./module.decorator";

/** The yaw half of `Rotation` - index 1 is the pitch, which a rig must not copy. */
const YAW = NbtPath("Rotation[0]");

/** Extra module metadata `toModule` passes straight through. */
export interface MobModuleOpts {
  /** Upkeep period in ticks (default `2`). */
  tickEvery?: number;
  dimension?: Id;
}

/**
 * Fluent builder for a **custom mob**: a real vanilla mob doing the AI, pathing,
 * damage and death, with a display-entity model riding it. The mob is the source
 * of truth and the rig is cosmetic, carried along for free - no per-tick teleport.
 *
 *   const sentinel = defineMob(Husk({ ... }), rig())
 *     .relayHits(4)
 *     .toModule("sentinel");
 *
 *   @Module({ name: "keep", imports: [sentinel] })
 *
 * Riding leaves three things to the framework, all wired here:
 *
 * - **Yaw.** A display passenger keeps its own rotation, so it would face north
 *   forever; each mob's `Rotation` is copied onto its rig.
 * - **Reach.** The model is usually taller than the mob's own hitbox, so the top
 *   of it is unhittable. If the model carries an `interaction` hitbox
 *   (`Display.hitbox(...)`), {@link relayHits} turns a hit on it into real damage.
 * - **Death.** Killing a vehicle only *dismounts* its passengers - a rig would
 *   outlive its mob as a hovering statue. Rigs whose mob is gone are swept.
 *
 * The mob is summoned by the generated `<name>/summon` function, at wherever it
 * is run from ({@link summonRef} gets you a handle to call it).
 */
/**
 * A one-shot **member animation**: swing an arm, open a jaw, tilt a head. Vanilla
 * has no per-mob animation state, so a gesture is a rotation about a pivot that is
 * snapped on and then interpolated back to the model's own rest pose - two `data
 * merge`s per member, no tween to drive.
 */
export interface Gesture {
  /** Which members move, as indices into the model's `members()` (root is 0). */
  members: number[];
  /** What they turn about, in the model's own coordinates (the group `offset` is added for you). */
  pivot: Vec3;
  /**
   * How far, held for the raise. Falling back to rest is the visible half.
   *
   * An **array** is a sequence: one pose per poll, each interpolated over the
   * module's `tickEvery`, then the fall back to rest - which is how a rotation
   * bigger than a snap (a spin, a wind-up) is expressed, since a single pose can
   * only ever be somewhere the slerp home from it looks right. The steps are
   * driven by the gesture's own cooldown score, so each mob runs its own
   * sequence; `cooldown` must exceed the number of steps.
   */
  rotate: Quat | Quat[];
  /**
   * A constant rotation held for the whole gesture, composed onto the members'
   * own orientation but **not** applied to their positions - the difference
   * between orbiting the pivot and lying flat while doing it. Put an axis change
   * in `rotate` instead and the members' translations rotate out of the orbit
   * plane with them.
   */
  tilt?: Quat;
  /**
   * Ticks the **first** pose takes to interpolate in, and that it is held before the
   * sequence steps on - a wind-up, and the only way a `tilt` eases in rather than
   * snapping. Default `0`: the pose lands on the frame it fires, which is what a
   * one-step gesture (snap out, slerp home) wants.
   *
   * The hold is what makes it visible: a duration alone would be overwritten by the
   * next poll's step a tick later, so the step clock shifts with it.
   */
  rise?: number;
  /** Ticks the fall takes (default `4`). A feel knob - shorter is snappier. */
  fall?: number;
  /** Ticks before it can fire again (default `20`). Ignored for manual calls. */
  cooldown?: number;
  /** When it fires, evaluated as the mob at its own position. Omit for manual-only. */
  when?: Detector;
  /**
   * Extra commands emitted into the gesture's own function, i.e. run **as the mob,
   * at it** - the hit that goes with the swing. Vanilla gives no attack event, so
   * this fires with the gesture, not on contact. The pack is passed too, since the
   * hit is usually where a library (a motion kick, a particle effect) is reached for.
   *
   * See {@link fireAfter} to land it partway through the animation instead.
   */
  onFire?: (ctx: FunctionContext, dp: Datapack) => void;
  /**
   * Ticks after the raise that {@link onFire} lands, so the hit reads as the *result*
   * of the swing rather than its cause - the blade comes round, and a beat later you
   * go flying. Default `0`: it fires with the raise, in the gesture's own function.
   *
   * Anything else moves it into the poll loop, guarded on the mob's own cooldown, so
   * it stays per-mob; it needs a cooldown (the step clock) and must land inside it.
   */
  fireAfter?: number;
  /**
   * A second beat, later in the same cooldown: extra commands run {@link recoverAfter}
   * ticks after the raise, as the mob, at it. What {@link onFire} spends,
   * {@link onRecover} puts back - a crossbow emptied on the shot and reloaded before
   * the next one. Needs a cooldown (the clock it is counted on) and must land inside it.
   */
  onRecover?: (ctx: FunctionContext, dp: Datapack) => void;
  /** Ticks after the raise that {@link onRecover} lands. Default `0`. */
  recoverAfter?: number;
}

export class MobBuilder {
  private relay?: { damage: number; type?: DamageType };
  private readonly gestures = new Map<string, Gesture>();

  constructor(
    private readonly nbt: IdentifiedEntityNbt,
    private readonly model: DisplayValue,
  ) {}

  /**
   * Turn a hit on the model's `interaction` hitbox into `damage` real damage on
   * the mob (default type: whatever `damage` defaults to, i.e. generic). Requires
   * the model to have been given a hitbox.
   */
  relayHits(damage: number, type?: DamageType): this {
    this.relay = { damage, type };
    return this;
  }

  /**
   * Add a named {@link Gesture}. It becomes a `<mob>/<name>` function you can call
   * as the mob yourself, plus - if the gesture has a `when` - a per-tick trigger.
   */
  gesture(name: string, g: Gesture): this {
    this.gestures.set(name, g);
    return this;
  }

  /** Compile to a drop-in {@link ConfiguredModule} (name = module / tag id). */
  toModule(name: string, opts: MobModuleOpts = {}): MobModuleRef {
    const tickEvery = opts.tickEvery ?? 2;
    const mob = new MobModule(name, this.nbt, this.model, tickEvery, this.relay, this.gestures);
    const mod = defineModule({ name, tickEvery, dimension: opts.dimension }, mob) as MobModuleRef;
    // Getters, not values: the functions don't exist until the module registers,
    // which is after the importing module has built this.
    Object.defineProperties(mod, {
      summon: { get: () => mob.fnRef("summon"), enumerable: true },
      spawn: { get: () => mob.fnRef("spawn"), enumerable: true },
      gestures: {
        get: () =>
          Object.fromEntries([...this.gestures.keys()].map((g) => [g, mob.fnRef(g)])),
        enumerable: true,
      },
    });
    return mod;
  }
}

/**
 * A configured mob module, plus handles to the functions it generated - so a
 * consumer calls `mob.summon` rather than looking a name up on the datapack.
 * Both are read *after* registration (from `onLoad`/`onTick`/a later `register`).
 */
export interface MobModuleRef extends ConfiguredModule {
  /** Summons the mob wherever it is run - `ctx.execute().at(...).run(b => b.call(mob.summon))`. */
  readonly summon: FunctionRef;
  /** `<name>/spawn`: summons one at the nearest player, from anywhere. The command to type. */
  readonly spawn: FunctionRef;
  /** Each {@link Gesture}'s raise function, by name - call it *as* the mob. */
  readonly gestures: Record<string, FunctionRef>;
}

/** The {@link DatapackModule} a {@link MobBuilder} compiles to. */
class MobModule implements DatapackModule {
  private killRig!: FunctionRef;
  private faceOne!: FunctionRef;

  constructor(
    private readonly name: string,
    private readonly nbt: IdentifiedEntityNbt,
    private readonly model: DisplayValue,
    private readonly tickEvery: number,
    private readonly relay?: { damage: number; type?: DamageType },
    private readonly gestures: ReadonlyMap<string, Gesture> = new Map(),
  ) {}

  /** Each generated function by short name (`summon`, a gesture), once registered. */
  private readonly fns = new Map<string, FunctionRef>();
  private cooldowns?: Objective;

  fnRef(short: string): FunctionRef {
    const ref = this.fns.get(short);
    if (!ref) {
      throw new Error(
        `Mob "${this.name}" has no "${short}" function yet - it registers after the module importing it, so read this from onLoad/onTick, not a constructor.`,
      );
    }
    return ref;
  }

  /** The rig's group name - every member is tagged with it (see `Display.named`). */
  private get rig(): string {
    return `${this.name}_rig`;
  }
  private get mobs(): Selector {
    return Selector.allEntities().tag(this.name);
  }
  /** Member 0 is the group root: the entity that actually rides the mob. */
  private get rigRoots(): Selector {
    return Selector.allEntities().tag(`${this.rig}_0`);
  }
  private get orphanTag(): string {
    return `${this.name}.orphan`;
  }
  /** Only ever set inside `summon`, to pair the two entities it just made. */
  private get freshTag(): string {
    return `${this.name}.new`;
  }
  /** Held by exactly one rig at a time, inside `face_one`. */
  private get curTag(): string {
    return `${this.name}.cur`;
  }

  register(dp: Datapack, scope: ModuleScope): void {
    this.model.named(this.rig);

    this.killRig = scope.fn(`${this.name}/kill_rig`, (ctx) => {
      // Passengers first: killing a vehicle dismounts its riders, it doesn't kill them.
      ctx.execute().on(Relation.PASSENGERS).run((b) => b.kill(Selector.self()));
      ctx.kill(Selector.self());
    });

    // Run as one rig: it tags itself so that, once `on vehicle` has swapped `@s`
    // to the mob, the rig is still nameable. That exactness is the point - the
    // nearest-rig-within-2-blocks guess this replaces made two mobs standing in
    // each other wear (and steer by) the same model.
    this.faceOne = scope.fn(`${this.name}/face_one`, (ctx) => {
      const me = Selector.allEntities().tag(this.curTag).limit(1);
      ctx.tag().add(Selector.self(), this.curTag);
      // Yaw only: the mob pitches to look up/down at its target, and a display
      // entity would tilt the whole model with it.
      ctx
        .execute()
        .on(Relation.VEHICLE)
        .run((b) => b.entity(me).set(YAW, b.entity(Selector.self()).at(YAW)));
      // Every other member rides the root, and a passenger keeps its own rotation -
      // so turning the root alone leaves head, arms and weapon still facing north.
      // They all sit at the root's position, so the same yaw turns the model as one.
      ctx
        .execute()
        .on(Relation.PASSENGERS)
        .run((b) => b.entity(Selector.self()).set(YAW, b.entity(me).at(YAW)));
      ctx.tag().remove(Selector.self(), this.curTag);
    });

    const summon = scope.fn(`${this.name}/summon`, (ctx) => {
      const fresh = this.freshTag;
      // Summoned separately and mounted, rather than nested in the mob's own NBT:
      // the two typed values stay independent, so the same rig can ride any mob.
      ctx.summon(this.nbt.tagged(this.name, fresh), Pos.rel(0, 0, 0));
      ctx.summon(this.model.toNbt().tagged(fresh), Pos.rel(0, 0, 0));
      ctx
        .execute()
        .as(Selector.allEntities().tag(`${this.rig}_0`).tag(fresh))
        .run((b) =>
          b.ride().mount(Selector.self(), Selector.allEntities().tag(this.name).tag(fresh).limit(1)),
        );
      ctx.tag().remove(Selector.allEntities().tag(fresh), fresh);
    });

    this.fns.set("summon", summon);

    // The command a human types. Every pack wrote this by hand; it belongs here.
    this.fns.set(
      "spawn",
      scope.fn(`${this.name}/spawn`, (ctx) => {
        ctx.execute().at(Selector.nearest()).run((b) => b.call(summon));
      }),
    );

    if (this.gestures.size) this.cooldowns = dp.objective(`${this.name}.gest`);
    for (const [gname, g] of this.gestures) {
      const steps = poses(g);
      if (steps.length > 1 && (g.cooldown ?? 20) <= steps.length + hold(g)) {
        throw new Error(
          `Gesture "${gname}" has ${steps.length} steps plus a ${hold(g)}-tick rise hold but a cooldown of ${g.cooldown ?? 20} - the cooldown is the step clock, so it must be longer.`,
        );
      }
      if (g.fireAfter) {
        if ((g.cooldown ?? 20) <= g.fireAfter) {
          throw new Error(
            `Gesture "${gname}" fires its hit ${g.fireAfter} ticks in but has a cooldown of ${g.cooldown ?? 20} - the cooldown is the clock the delay is counted on, so it must be longer.`,
          );
        }
        // Its own function, not inlined into the poll: the tick pays one call, and
        // only for the mobs actually mid-swing.
        this.fns.set(
          `${gname}_hit`,
          scope.fn(`${this.name}/${gname}_hit`, (ctx) => g.onFire?.(ctx, dp)),
        );
      }
      if (g.onRecover) {
        if ((g.cooldown ?? 20) <= (g.recoverAfter ?? 0)) {
          throw new Error(
            `Gesture "${gname}" recovers ${g.recoverAfter ?? 0} ticks in but has a cooldown of ${g.cooldown ?? 20} - the cooldown is the clock the delay is counted on, so it must be longer.`,
          );
        }
        this.fns.set(
          `${gname}_recover`,
          scope.fn(`${this.name}/${gname}_recover`, (ctx) => g.onRecover?.(ctx, dp)),
        );
      }
      this.fns.set(
        gname,
        scope.fn(`${this.name}/${gname}`, (ctx) => {
          ctx.tag().add(Selector.self(), this.gestureTag(gname));
          if (g.cooldown !== 0) {
            this.cooldown(Selector.self()).set(g.cooldown ?? 20, ctx);
          }
          this.poseMembers(ctx, Selector.self(), g, steps[0], g.rise ?? 0);
          if (!g.fireAfter) g.onFire?.(ctx, dp);
        }),
      );
    }
  }

  /** Worn while a gesture is raised - cleared next tick, which starts the fall. */
  private gestureTag(gname: string): string {
    return `${this.name}.${gname}`;
  }

  private cooldown(target: Selector) {
    return this.cooldowns!.score(ScoreTarget(target));
  }

  /**
   * Merge one pose onto each moving member. Run as the mob, walking `passengers`
   * down to the member, so this only ever touches *this* mob's rig (a tag alone
   * would hit every one of them). Member 0 **is** the rig root, i.e. one hop from
   * the mob; every other member is a passenger of that root, so two.
   */
  private poseMembers(
    ctx: FunctionContext,
    self: Selector,
    g: Gesture,
    /** The rotation to hold, or `undefined` for the model's own rest pose. */
    q: Quat | undefined,
    duration: number,
  ): void {
    const members = this.model.members();
    const pivot = add(g.pivot, this.model.getOffset());
    for (const i of g.members) {
      const rest = members[i]?.transform;
      if (!rest) throw new Error(`Gesture member ${i} is not a member of "${this.name}"'s model.`);
      const chain = ctx.execute().as(self).on(Relation.PASSENGERS);
      if (i !== 0) chain.on(Relation.PASSENGERS);
      chain
        .run((b) =>
          b
            .data()
            .merge()
            .entity(
              Selector.self().tag(`${this.rig}_${i}`),
              displayPose(q ? raise(rest, pivot, q, g.tilt) : rest, duration),
            ),
        );
    }
  }

  private tickGesture(ctx: FunctionContext, gname: string, g: Gesture): void {
    const tag = this.gestureTag(gname);
    const steps = poses(g);
    const raisedMobs = () => Selector.allEntities().tag(this.name).tag(tag);
    // The fall is emitted *before* the trigger, or a gesture started this tick
    // would be dropped again by its own end in the same function body.
    if (steps.length === 1) {
      this.poseMembers(ctx, raisedMobs(), g, undefined, g.fall ?? 4);
      ctx.tag().remove(raisedMobs(), tag);
    }

    if (g.cooldown !== 0) {
      // Only the ones actually counting down: `remove` on an unset score would
      // start one at -1 and run it down forever.
      this.cooldown(
        Selector.allEntities().tag(this.name).score(this.cooldowns!, new Range(1, undefined)),
      ).remove(1, ctx);
    }

    const at = (v: number) =>
      Selector.allEntities().tag(this.name).score(this.cooldowns!, new Range(v, v));

    // The delayed hit rides the same clock as the steps: the mobs exactly
    // `fireAfter` polls past their raise, run as themselves, at themselves.
    if (g.fireAfter) {
      ctx
        .execute()
        .as(at((g.cooldown ?? 20) - g.fireAfter))
        .at(Selector.self())
        .run((b) => b.call(this.fnRef(`${gname}_hit`)));
    }

    // Same clock, a later beat: whatever `onFire` spent, put back.
    if (g.onRecover) {
      ctx
        .execute()
        .as(at((g.cooldown ?? 20) - (g.recoverAfter ?? 0)))
        .at(Selector.self())
        .run((b) => b.call(this.fnRef(`${gname}_recover`)));
    }

    // A sequence walks itself down its own cooldown: step k is whichever mobs are
    // exactly k polls past their raise, so every mob runs its own animation
    // (rather than a shared clock, which would put them all in lockstep). Emitted
    // *after* the decrement, so the poll right after the raise is step 1.
    if (steps.length > 1) {
      // The rise's hold pushes the whole sequence back, so the first pose gets its
      // interpolation to itself instead of being overwritten by step 1 next poll.
      const start = (g.cooldown ?? 20) - hold(g);
      for (let k = 1; k < steps.length; k++) {
        this.poseMembers(ctx, at(start - k), g, steps[k], this.tickEvery);
      }
      // Home again. Slerp takes the short way, so a sequence ending just short of
      // a full turn finishes it forwards rather than winding back.
      this.poseMembers(ctx, at(start - steps.length), g, undefined, g.fall ?? 4);
      ctx.tag().remove(at(start - steps.length), tag);
    }

    if (!g.when) return;
    const chain = ctx.execute().as(Selector.allEntities().tag(this.name)).at(Selector.self());
    if (g.cooldown !== 0) chain.unlessScoreMatches(this.cooldown(Selector.self()), new Range(1, undefined));
    g.when(chain);
    chain.run((b) => b.call(this.fnRef(gname)));
  }

  onTick(ctx: FunctionContext): void {
    for (const [gname, g] of this.gestures) this.tickGesture(ctx, gname, g);
    this.faceRig(ctx);
    if (this.relay) this.relayHits(ctx, this.relay);
    this.sweepOrphans(ctx);
  }

  /** Point every rig the way the mob it actually rides is facing. */
  private faceRig(ctx: FunctionContext): void {
    ctx.execute().as(this.rigRoots).run((b) => b.call(this.faceOne));
  }

  /** Relay a hit on the tall interaction box down onto the mob carrying it. */
  private relayHits(ctx: FunctionContext, relay: { damage: number; type?: DamageType }): void {
    // The `attack` compound only exists on an interaction that was hit.
    const wasHit = Selector.allEntities().tag(`${this.rig}_hitbox`).nbt(Nbt({ attack: {} }));
    ctx
      .execute()
      .as(wasHit)
      // hitbox -> rig root -> mob.
      .on(Relation.VEHICLE)
      .on(Relation.VEHICLE)
      .run((b) => b.damage(Selector.self(), relay.damage, relay.type));
    // ponytail: one relayed hit per poll - the record only keeps the last one.
    ctx.execute().as(wasHit).run((b) => b.entity(Selector.self()).remove(NbtPath("attack")));
  }

  /**
   * Kill rigs whose mob is gone. Mark-and-sweep rather than a "does it have a
   * vehicle" check, because there is no such check: the vehicle is what knows its
   * passengers, so the surviving mobs clear the mark and whatever is still marked
   * was riding something that died, despawned or unloaded.
   */
  private sweepOrphans(ctx: FunctionContext): void {
    ctx.tag().add(this.rigRoots, this.orphanTag);
    ctx
      .execute()
      .as(this.mobs)
      .on(Relation.PASSENGERS)
      .run((b) => b.tag().remove(Selector.self(), this.orphanTag));
    ctx
      .execute()
      .as(Selector.allEntities().tag(`${this.rig}_0`).tag(this.orphanTag))
      .run((b) => b.call(this.killRig));
  }
}

/**
 * A member's rest transform, rotated about `pivot`. Display entities have no
 * transform inheritance, so turning a member is two things at once: its position
 * is the rotated offset, and the same rotation is composed onto whatever
 * orientation it already holds (`mulQuat(q, left)` applies `left` first).
 */
function raise(rest: Transform, pivot: Vec3, q: Quat, tilt?: Quat): Transform {
  return {
    ...rest,
    translation: rotateAboutPivot(rest.translation ?? [0, 0, 0], pivot, q).map(round6) as Vec3,
    leftRotation: mulQuat(tilt ? mulQuat(q, tilt) : q, rest.leftRotation ?? [0, 0, 0, 1]).map(
      round6,
    ) as Quat,
  };
}

/**
 * Extra polls the first pose is held for. A `rise` of 1 already lands within one poll,
 * so only what's beyond that shifts the step clock - which is what keeps `rise: 0`
 * (and a plain gesture that never sets it) emitting exactly what it always did.
 */
function hold(g: Gesture): number {
  return Math.max(0, (g.rise ?? 0) - 1);
}

/** A gesture's poses, as a sequence - the single-quat form is the one-step case. */
function poses(g: Gesture): Quat[] {
  return Array.isArray(g.rotate[0]) ? (g.rotate as Quat[]) : [g.rotate as Quat];
}

/** Start a custom-mob definition from the mob it really is and the model it wears. */
export function defineMob(nbt: IdentifiedEntityNbt, model: DisplayValue): MobBuilder {
  return new MobBuilder(nbt, model);
}
