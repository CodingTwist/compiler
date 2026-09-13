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
  privateName,
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
  Score,
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
  /**
   * How near a player has to be for a mob to run at all (default `48`). Checked once a
   * second; a mob further than this - or unloaded - costs nothing, and a mob mid-gesture
   * stays awake until the gesture's clock runs out. ponytail: feel knob - keep it above
   * the mob's `FOLLOW_RANGE` so it wakes before it would aggro.
   */
  wakeRange?: number;
}

/**
 * Per-mob body: run as the mob, at it. `mob` switches this mob between its
 * {@link MobBuilder.states} (declare `.states()` first to get the names typed).
 */
export type MobTick<S extends string = never> = (ctx: FunctionContext, dp: Datapack, mob: MobStates<S>) => void;

/**
 * One phase of a mob - airborne, slamming, stunned. A mob is in at most one state,
 * held as a score, so a mob in none costs one check per poll and a mob in one runs
 * only that state's body: the phase guard is written once, by the framework.
 */
export interface MobState<S extends string> {
  /** Polls it lasts. Omit to stay until something enters another state. */
  polls?: number;
  /** Once, on entering, as the mob, at it. */
  onEnter?: MobTick<S>;
  /** Each poll while in it, as the mob, at it - after the clock has counted down. */
  tick?: MobTick<S>;
  /** When {@link polls} run out, before {@link then}. */
  onDone?: MobTick<S>;
  /** Entered when {@link polls} run out. Omit to go back to no state. */
  then?: S;
}

/** A mob's state switch, handed to every body that runs as the mob. */
export interface MobStates<S extends string> {
  /** Put this mob (`@s`) into `state`, running its `onEnter`. */
  enter(ctx: FunctionContext, state: S): void;
  /** Take this mob (`@s`) out of any state. */
  leave(ctx: FunctionContext): void;
  /** Polls left in the current timed state, on `@s` - what phases within a state test. */
  readonly clock: Score;
}

/**
 * A one-shot **member animation**: swing an arm, open a jaw, tilt a head. Vanilla
 * has no per-mob animation state, so a gesture is a rotation about a pivot that is
 * snapped on and then interpolated back to the model's own rest pose - two `data
 * merge`s per member, no tween to drive.
 */
export interface Gesture<S extends string = never> {
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
  /**
   * Extra polls the **last** pose is held before the fall - a mace kept raised through a
   * leap and brought home only after it lands. Default `0`. Any linger runs the gesture
   * on the step clock, so it needs a cooldown longer than the whole timeline.
   */
  linger?: number;
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
  onFire?: MobTick<S>;
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
  onRecover?: MobTick<S>;
  /** Ticks after the raise that {@link onRecover} lands. Default `0`. */
  recoverAfter?: number;
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
export class MobBuilder<S extends string = never> {
  private relay?: { damage: number; type?: DamageType };
  private readonly gestures = new Map<string, Gesture<S>>();
  private tick?: MobTick<S>;
  private stateDefs = new Map<string, MobState<S>>();

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
  gesture(name: string, g: Gesture<S>): this {
    this.gestures.set(name, g);
    return this;
  }

  /**
   * The mob's {@link MobState}s, by name. Declare them before the gestures and
   * `onTick` that enter them, so those bodies get the names typed. Each state
   * becomes `<mob>/state/<name>`, reached by one score dispatch per poll; the
   * `states` handles on the module enter one from outside.
   */
  states<T extends string>(defs: Record<T, MobState<NoInfer<T>>>): MobBuilder<T> {
    const self = this as unknown as MobBuilder<T>;
    self.stateDefs = new Map(Object.entries(defs) as [T, MobState<T>][]);
    return self;
  }

  /**
   * Your own per-tick behaviour, **run as each awake mob, at it** - so write `@s`, never
   * `@e[tag=…]`. Runs before the gestures and the rig's yaw copy, so what it tags or
   * turns is what they see this poll. It lands in its own `<mob>/on_tick` function (`onTickFn` on the module),
   * which is what to hand `dp.allowNbtRead` when a read in it is meant to be fast.
   */
  onTick(body: MobTick<S>): this {
    this.tick = body;
    return this;
  }

  /** The model and every gesture's pose timeline, resolved to plain transforms - see {@link MobPreview}. */
  private preview(tickEvery: number): MobPreview {
    const members = this.model.members().map(({ content, transform }) => ({
      kind: content.kind,
      id: content.kind === "item" ? content.item.baseId() : content.block.toBlockState().Name,
      transform,
    }));
    const gestures = [...this.gestures].map(([name, g]) => ({
      name,
      pivot: add(g.pivot, this.model.getOffset()),
      members: g.members,
      steps: poses(g),
      tilt: g.tilt,
      rise: g.rise ?? 0,
      linger: g.linger ?? 0,
      fall: g.fall ?? 4,
      writes: poseSchedule(g, tickEvery).map((w) => ({
        tick: w.poll * tickEvery,
        duration: w.duration,
        poses: Object.fromEntries(g.members.map((i) => [i, memberPose(this.model, g, i, w.q)])),
      })),
    }));
    return { tickEvery, offset: this.model.getOffset(), members, gestures };
  }

  /** Compile to a drop-in {@link ConfiguredModule} (name = module / tag id). */
  toModule(name: string, opts: MobModuleOpts = {}): MobModuleRef {
    const tickEvery = opts.tickEvery ?? 2;
    const mob = new MobModule<S>(name, this.nbt, this.model, tickEvery, opts.wakeRange ?? 48, this.relay, this.gestures, this.tick, this.stateDefs);
    const mod = defineModule({ name, tickEvery, dimension: opts.dimension }, mob) as MobModuleRef;
    // Getters, not values: the functions don't exist until the module registers,
    // which is after the importing module has built this.
    Object.defineProperties(mod, {
      summon: { get: () => mob.fnRef("summon"), enumerable: true },
      spawn: { get: () => mob.fnRef("spawn"), enumerable: true },
      onTickFn: { get: () => mob.fnRef("on_tick"), enumerable: true },
      gestures: {
        get: () =>
          Object.fromEntries([...this.gestures.keys()].map((g) => [g, mob.fnRef(g)])),
        enumerable: true,
      },
      states: {
        get: () =>
          Object.fromEntries([...this.stateDefs.keys()].map((s) => [s, mob.fnRef(`enter/${s}`)])),
        enumerable: true,
      },
      preview: { value: () => this.preview(tickEvery) },
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
  /** `<name>/on_tick`, the {@link MobBuilder.onTick} body. Throws if there isn't one. */
  readonly onTickFn: FunctionRef;
  /** Each {@link Gesture}'s raise function, by name - call it *as* the mob. */
  readonly gestures: Record<string, FunctionRef>;
  /** Each {@link MobState}'s enter function, by name - call it *as* the mob. */
  readonly states: Record<string, FunctionRef>;
  /** The model and gesture timelines as plain data - what `writeMobPreview` renders. */
  preview(): MobPreview;
}

/**
 * A mob rig resolved to what the game is sent: each member's rest transform, and per
 * gesture every `data merge` it writes (tick after the raise, interpolation, and the
 * affected members' target transforms).
 */
export interface MobPreview {
  tickEvery: number;
  /** The model's group offset - gesture pivots here include it, authored ones don't. */
  offset: Vec3;
  members: { kind: "item" | "block"; id: string; transform: Transform }[];
  gestures: {
    name: string;
    pivot: Vec3;
    members: number[];
    steps: Quat[];
    tilt?: Quat;
    rise: number;
    linger: number;
    fall: number;
    writes: { tick: number; duration: number; poses: Record<number, Transform> }[];
  }[];
}

/** The {@link DatapackModule} a {@link MobBuilder} compiles to. */
class MobModule<S extends string> implements DatapackModule {
  private killRig!: FunctionRef;
  private faceOne!: FunctionRef;

  constructor(
    private readonly name: string,
    private readonly nbt: IdentifiedEntityNbt,
    private readonly model: DisplayValue,
    private readonly tickEvery: number,
    private readonly wakeRange: number,
    private readonly relay: { damage: number; type?: DamageType } | undefined,
    private readonly gestures: ReadonlyMap<string, Gesture<S>>,
    private readonly tick: MobTick<S> | undefined,
    private readonly stateDefs: ReadonlyMap<string, MobState<S>>,
  ) {}

  /** `<mob>.state`: the 1-based index of the state a mob is in, 0 for none. */
  private stateObj!: Objective;
  /** `<mob>.state_t`: polls left in a timed state. */
  private stateClockObj!: Objective;
  private handle!: MobStates<S>;

  private dp!: Datapack;
  private wake!: FunctionRef;
  private tickOne!: FunctionRef;
  /** `#wake` counts polls to the next wake; `#awake` is how many mobs it found. */
  private awakeObj!: Objective;

  /** Each generated function by short name (`summon`, a gesture), once registered. */
  private readonly fns = new Map<string, FunctionRef>();
  /**
   * One clock **per gesture**, not one per mob: they share the poll but not the
   * countdown, or a cheap idle gesture's cooldown would gate every other gesture
   * (its `unless score … matches 1..`) and starve them.
   */
  private readonly cooldowns = new Map<string, Objective>();

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
    return Selector.allEntities().type(this.nbt.entity).tag(this.name);
  }
  /** Member 0 is the group root: the entity that actually rides the mob. */
  private get rigRoots(): Selector {
    const root = this.model.members()[0].content.kind;
    return Selector.allEntities().type(`minecraft:${root}_display`).tag(`${this.rig}_0`);
  }
  private get awakeTag(): string {
    return `${this.name}.awake`;
  }
  /** Awake only to finish a gesture: no player near, so nothing new may fire. */
  private get finishingTag(): string {
    return `${this.name}.finishing`;
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

  /** A function only this mob's own tick tree calls: no dimension wrap, since it inherits the caller's. */
  private internal(short: string, body: (ctx: FunctionContext) => void): FunctionRef {
    const fn = this.dp.createFunction(privateName(`${this.name}/${short}`));
    fn.build(body);
    return fn;
  }

  register(dp: Datapack, scope: ModuleScope): void {
    this.dp = dp;
    this.model.named(this.rig);

    // Before any author body is built: they all take the switch.
    if (this.stateDefs.size) {
      this.stateObj = dp.objective(`${this.name}.state`);
      this.stateClockObj = dp.objective(`${this.name}.state_t`);
      for (const s of this.stateDefs.keys()) this.fns.set(`enter/${s}`, dp.createFunction(`${this.name}/enter/${s}`));
    }
    const mobName = this.name;
    const states = this;
    this.handle = {
      enter: (ctx, s) => ctx.call(states.fnRef(`enter/${s}`)),
      leave: (ctx) => states.stateObj.score(Selector.self()).set(0, ctx),
      get clock() {
        if (!states.stateClockObj) throw new Error(`Mob "${mobName}" has no states - declare them with .states() to use the clock.`);
        return states.stateClockObj.score(Selector.self());
      },
    };

    this.killRig = scope.fn(privateName(`${this.name}/kill_rig`), (ctx) => {
      // Passengers first: killing a vehicle dismounts its riders, it doesn't kill them.
      ctx.execute().on(Relation.PASSENGERS).run((b) => b.kill(Selector.self()));
      ctx.kill(Selector.self());
    });

    // Run as one rig: it tags itself so that, once `on vehicle` has swapped `@s`
    // to the mob, the rig is still nameable. That exactness is the point - the
    // nearest-rig-within-2-blocks guess this replaces made two mobs standing in
    // each other wear (and steer by) the same model.
    this.faceOne = scope.fn(privateName(`${this.name}/face_one`), (ctx) => {
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

    for (const [gname, g] of this.gestures) {
      this.cooldowns.set(gname, dp.objective(`${this.name}.${gname}`));
      const end = poseSchedule(g, this.tickEvery).at(-1)!.poll;
      if (sequenced(g) && (g.cooldown ?? 20) <= end) {
        throw new Error(
          `Gesture "${gname}" comes home ${end} polls in (steps, rise hold and linger) but has a cooldown of ${g.cooldown ?? 20} - the cooldown is the step clock, so it must be longer.`,
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
          scope.fn(privateName(`${this.name}/${gname}_hit`), (ctx) => g.onFire?.(ctx, dp, this.handle)),
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
          scope.fn(privateName(`${this.name}/${gname}_recover`), (ctx) => g.onRecover?.(ctx, dp, this.handle)),
        );
      }
      this.fns.set(
        gname,
        scope.fn(`${this.name}/${gname}`, (ctx) => {
          ctx.tag().add(Selector.self(), this.gestureTag(gname));
          if (g.cooldown !== 0) {
            this.cooldown(Selector.self(), gname).set(g.cooldown ?? 20, ctx);
          }
          this.poseMembers(ctx, undefined, g, poses(g)[0], g.rise ?? 0);
          if (!g.fireAfter) g.onFire?.(ctx, dp, this.handle);
        }),
      );
      // A cooldown caps how often the gesture's own bodies can run, which the report
      // can't see - it only sees them called from the poll.
      const cooldown = g.cooldown ?? 20;
      if (g.when && cooldown >= 5) {
        for (const fn of [gname, `${gname}_hit`, `${gname}_recover`]) {
          if (this.fns.has(fn)) dp.allowNbtRead(this.fns.get(fn)!, `at most once per ${cooldown}-tick cooldown`);
        }
      }
      // The clock-driven half runs only for a mob whose clock is running.
      if (g.cooldown !== 0) {
        this.fns.set(`${gname}_clock`, dp.createFunction(privateName(`${this.name}/${gname}_clock`)));
        this.fns.get(`${gname}_clock`)!.build((ctx) => this.clockGesture(ctx, gname, g));
      }
    }

    if (this.tick) {
      const body = this.tick;
      this.fns.set("on_tick", scope.fn(privateName(`${this.name}/on_tick`), (ctx) => body(ctx, dp, this.handle)));
    }
    this.registerStates(dp);
    // The yaw copy is a read per rig per tick, and the whole point of riding.
    dp.allowNbtRead(this.faceOne, "rig yaw copy, awake mobs only");

    this.awakeObj = dp.objective(`${this.name}.awake`);
    this.wake = scope.fn(privateName(`${this.name}/wake`), (ctx) => this.wakeBody(ctx));
    this.tickOne = dp.createFunction(privateName(`${this.name}/tick_one`));
    this.tickOne.build((ctx) => this.tickOneBody(ctx));
  }

  /**
   * `<mob>/enter/<s>`, `<mob>/state/<s>` (+ `/done` for a timed one), and `<mob>/state`:
   * the dispatch `tick_one` calls for a mob in any state.
   */
  private registerStates(dp: Datapack): void {
    if (!this.stateDefs.size) return;
    const state = this.stateObj.score(Selector.self());
    const clock = this.stateClockObj.score(Selector.self());
    const cases = [...this.stateDefs].map(([s, def], i) => {
      const idx = i + 1;
      this.fns.get(`enter/${s}`)!.build((ctx) => {
        state.set(idx, ctx);
        // Zeroed for an untimed state too, or a stale count would keep the mob awake in it.
        clock.set(def.polls ?? 0, ctx);
        def.onEnter?.(ctx, dp, this.handle);
      });
      const done =
        def.polls === undefined
          ? undefined
          : this.internal(`state/${s}/done`, (ctx) => {
              def.onDone?.(ctx, dp, this.handle);
              if (def.then) this.handle.enter(ctx, def.then);
              else this.handle.leave(ctx);
            });
      const body = this.internal(`state/${s}`, (ctx) => {
        if (done) clock.remove(1, ctx);
        def.tick?.(ctx, dp, this.handle);
        // Still in this state: a tick that already switched keeps its switch.
        if (done) {
          ctx
            .execute()
            .ifScoreMatches(state, Range.exactly(idx))
            .ifScoreMatches(clock, Range.atMost(0))
            .run((b) => b.call(done));
        }
      });
      return { range: Range.exactly(idx), fn: body };
    });
    if (cases.length === 1) {
      this.fns.set("state", cases[0].fn);
      return;
    }
    // Dispatched on a copy: a state body that enters a later state must not run that
    // one too in the same poll, whether or not `return run` stops the dispatch.
    const current = this.stateObj.score(ScoreTarget(`#${this.name}_state`));
    this.fns.set(
      "state",
      this.internal("state", (ctx) => {
        current.assign(state, ctx);
        ctx.dispatchScore(current, cases);
      }),
    );
  }

  /** Worn while a gesture is raised - cleared next tick, which starts the fall. */
  private gestureTag(gname: string): string {
    return `${this.name}.${gname}`;
  }

  private cooldown(target: Selector, gname: string) {
    return this.cooldowns.get(gname)!.score(ScoreTarget(target));
  }

  /**
   * Merge one pose onto each moving member. Run as the mob, walking `passengers`
   * down to the member, so this only ever touches *this* mob's rig (a tag alone
   * would hit every one of them). Member 0 **is** the rig root, i.e. one hop from
   * the mob; every other member is a passenger of that root, so two.
   */
  private poseMembers(
    ctx: FunctionContext,
    /** Who to pose, or `undefined` for `@s` itself - no `as` hop. */
    self: Selector | undefined,
    g: Gesture<S>,
    /** The rotation to hold, or `undefined` for the model's own rest pose. */
    q: Quat | undefined,
    duration: number,
  ): void {
    for (const i of g.members) {
      const chain = ctx.execute();
      if (self) chain.as(self);
      chain.on(Relation.PASSENGERS);
      if (i !== 0) chain.on(Relation.PASSENGERS);
      chain
        .run((b) =>
          b
            .data()
            .merge()
            .entity(
              Selector.self().tag(`${this.rig}_${i}`),
              displayPose(memberPose(this.model, g, i, q), duration),
            ),
        );
    }
  }

  /**
   * The gesture work every awake mob does each poll, as the mob: drop a one-step raise
   * or run its clock-driven half. Firing is {@link trigger}, grouped after every clock.
   */
  private tickGesture(ctx: FunctionContext, gname: string, g: Gesture<S>): void {
    const tag = this.gestureTag(gname);
    // The fall is emitted *before* the trigger, or a gesture started this tick
    // would be dropped again by its own end in the same function body.
    if (!sequenced(g)) {
      this.poseMembers(ctx, Selector.self().tag(tag), g, undefined, g.fall ?? 4);
      ctx.tag().remove(Selector.self().tag(tag), tag);
    }
    if (g.cooldown !== 0) {
      ctx
        .execute()
        .ifScoreMatches(this.cooldown(Selector.self(), gname), new Range(1, undefined))
        .run((b) => b.call(this.fnRef(`${gname}_clock`)));
    }
  }

  /** Fire `gname` if its `when` holds and its clock is idle. `guard` adds the finishing check. */
  private trigger(ctx: FunctionContext, gname: string, g: Gesture<S>, guard: boolean): void {
    const chain = ctx.execute();
    if (guard) chain.unlessEntity(Selector.self().tag(this.finishingTag));
    if (g.cooldown !== 0) {
      chain.unlessScoreMatches(this.cooldown(Selector.self(), gname), new Range(1, undefined));
    }
    g.when!(chain);
    chain.run((b) => b.call(this.fnRef(gname)));
  }

  /** `<mob>/<gesture>_clock`: one mob's countdown and everything timed off it. As the mob, at it. */
  private clockGesture(ctx: FunctionContext, gname: string, g: Gesture<S>): void {
    const tag = this.gestureTag(gname);
    this.cooldown(Selector.self(), gname).remove(1, ctx);
    // A beat on the clock: this mob, exactly `after` polls past its raise.
    const onBeat = (after: number, fn: string) =>
      ctx
        .execute()
        .ifScoreMatches(this.cooldown(Selector.self(), gname), new Range((g.cooldown ?? 20) - after, (g.cooldown ?? 20) - after))
        .run((b) => b.call(this.fnRef(fn)));

    // The delayed hit rides the same clock as the steps.
    if (g.fireAfter) onBeat(g.fireAfter, `${gname}_hit`);
    // Same clock, a later beat: whatever `onFire` spent, put back.
    if (g.onRecover) onBeat(g.recoverAfter ?? 0, `${gname}_recover`);

    // A sequence walks itself down its own cooldown: step k is k polls past the raise,
    // so every mob runs its own animation. After the decrement, so the poll right
    // after the raise is step 1.
    if (sequenced(g)) {
      // The raise function made write 0; the last write is home again. Slerp takes the
      // short way, so a sequence ending just short of a full turn finishes it forwards.
      // One function per step, picked by a single dispatch on the clock rather than
      // re-testing the score on every member's line.
      const later = poseSchedule(g, this.tickEvery).slice(1);
      const cases = later.map((w, k) => ({
        range: Range.exactly((g.cooldown ?? 20) - w.poll),
        fn: this.internal(`${gname}_step_${k + 1}`, (c) => {
          this.poseMembers(c, undefined, g, w.q, w.duration);
          if (k === later.length - 1) c.tag().remove(Selector.self(), tag);
        }),
      }));
      ctx.call(this.internal(`${gname}_pose`, (c) => c.dispatchScore(this.cooldown(Selector.self(), gname), cases)));
    }
  }

  /**
   * The only per-tick cost while no mob is near a player is a counter and a score
   * check: every `@e` scan lives in {@link wakeBody}, once a second.
   */
  onTick(ctx: FunctionContext): void {
    const wake = this.awakeObj.score(ScoreTarget("#wake"));
    wake.add(1, ctx);
    ctx
      .execute()
      .ifScoreMatches(wake, new Range(Math.ceil(20 / this.tickEvery), undefined))
      .run((b) => b.call(this.wake));
    ctx
      .execute()
      .ifScoreMatches(this.awakeObj.score(ScoreTarget("#awake")), new Range(1, undefined))
      .as(this.mobs.tag(this.awakeTag))
      .at(Selector.self())
      .run((b) => b.call(this.tickOne));
  }

  /** `<mob>/wake`: tag the mobs worth running, count them, and sweep orphaned rigs. */
  private wakeBody(ctx: FunctionContext): void {
    const self = Selector.self();
    // Mid-clock stays awake, so walking off can't freeze a swing (or a leap) halfway -
    // but only to finish it, or a looping idle gesture would keep it awake for good.
    const clocks = [...this.gestures].filter(([, g]) => g.cooldown !== 0).map(([gname]) => this.cooldowns.get(gname)!);
    if (this.stateClockObj) clocks.push(this.stateClockObj);
    const finish = clocks.length
      ? this.internal("wake_finish", (c) => {
          c.tag().add(self, this.finishingTag);
          c.tag().add(self, this.awakeTag);
        })
      : undefined;
    // One scan to reset every mob, then one per player for the ones near it.
    const one = this.internal("wake_one", (c) => {
      c.tag().remove(self, this.awakeTag);
      c.tag().remove(self, this.finishingTag);
      // ponytail: one line per clock - fine at a handful; a shared "busy" score if a mob grows many.
      for (const obj of clocks) {
        c.execute().ifScoreMatches(obj.score(self), Range.atLeast(1)).run((b) => b.call(finish!));
      }
    });
    const near = this.internal("wake_near", (c) => {
      c.tag().add(self, this.awakeTag);
      c.tag().remove(self, this.finishingTag);
    });
    ctx.execute().as(this.mobs).run((b) => b.call(one));
    ctx
      .execute()
      .at(Selector.allPlayers())
      .as(this.mobs.distance(Range.atMost(this.wakeRange)))
      .run((b) => b.call(near));
    ctx
      .execute()
      .storeResultScore(this.awakeObj.score(ScoreTarget("#awake")))
      .ifEntity(this.mobs.tag(this.awakeTag))
      .done();
    this.sweepOrphans(ctx);
    this.awakeObj.score(ScoreTarget("#wake")).set(0, ctx);
  }

  /** `<mob>/tick_one`: everything one awake mob does per poll, as it, at it. */
  private tickOneBody(ctx: FunctionContext): void {
    // Yours first: it decides what the gestures' triggers and the yaw copy then see.
    if (this.tick) ctx.call(this.fnRef("on_tick"));
    // Then the state, if any: one check for a mob in none.
    if (this.stateDefs.size) {
      ctx
        .execute()
        .ifScoreMatches(this.stateObj.score(Selector.self()), Range.atLeast(1))
        .run((b) => b.call(this.fnRef("state")));
    }
    for (const [gname, g] of this.gestures) this.tickGesture(ctx, gname, g);
    // Every trigger behind one finishing check: a finishing mob fires nothing new.
    const triggers = [...this.gestures].filter(([, g]) => g.when);
    if (triggers.length === 1) this.trigger(ctx, triggers[0][0], triggers[0][1], true);
    else if (triggers.length > 1) {
      const all = this.internal("triggers", (c) => {
        for (const [gname, g] of triggers) this.trigger(c, gname, g, false);
      });
      ctx
        .execute()
        .unlessEntity(Selector.self().tag(this.finishingTag))
        .run((b) => b.call(all));
    }
    // Point the rig the way this mob is facing.
    ctx
      .execute()
      .on(Relation.PASSENGERS)
      .ifEntity(Selector.self().tag(`${this.rig}_0`))
      .run((b) => b.call(this.faceOne));
    if (this.relay) this.relayHits(ctx, this.relay);
  }

  /**
   * Relay a hit on the tall interaction box down onto this mob. `on attacker` is the
   * hit test - an interaction names whoever last hit it - so nothing reads NBT until
   * there is a hit to clear. Hitbox -> rig root -> mob, hence two hops each way.
   */
  private relayHits(ctx: FunctionContext, relay: { damage: number; type?: DamageType }): void {
    const hit = this.relayFns ??= {
      attacked: this.attackedFn(),
      relay: this.relayFn(relay),
    };
    ctx
      .execute()
      .on(Relation.PASSENGERS)
      .on(Relation.PASSENGERS)
      .ifEntity(Selector.self().tag(`${this.rig}_hitbox`))
      .ifFunction(hit.attacked)
      .run((b) => b.call(hit.relay));
  }
  private relayFns?: { attacked: FunctionRef; relay: FunctionRef };

  private attackedFn(): FunctionRef {
    const fn = this.dp.createFunction(privateName(`${this.name}/attacked`));
    fn.build((ctx) => ctx.execute().on(Relation.ATTACKER).run((b) => b.return_(1)));
    return fn;
  }

  private relayFn(relay: { damage: number; type?: DamageType }): FunctionRef {
    const fn = this.dp.createFunction(privateName(`${this.name}/relay_hit`));
    fn.build((ctx) => {
      ctx
        .execute()
        .on(Relation.VEHICLE)
        .on(Relation.VEHICLE)
        .run((b) => b.damage(Selector.self(), relay.damage, relay.type));
      // ponytail: one relayed hit per poll - the record only keeps the last one.
      ctx.entity(Selector.self()).remove(NbtPath("attack"));
    });
    return fn;
  }

  /**
   * Kill rigs whose mob is gone. Mark-and-sweep rather than a "does it have a
   * vehicle" check, because there is no such check: the vehicle is what knows its
   * passengers, so the surviving mobs clear the mark and whatever is still marked
   * was riding something that died, despawned or unloaded.
   *
   * ponytail: runs from `wake`, so a dead mob's rig can hover up to a second - about
   * as long as the death animation. Move it back to the poll if that shows.
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
      .as(this.rigRoots.tag(this.orphanTag))
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

/** A member's transform while holding `q`, or its rest pose for `undefined`. */
function memberPose(model: DisplayValue, g: Gesture, i: number, q: Quat | undefined): Transform {
  const rest = model.members()[i]?.transform;
  if (!rest) throw new Error(`Gesture member ${i} is not a member of the model.`);
  return q ? raise(rest, add(g.pivot, model.getOffset()), q, g.tilt) : rest;
}

/**
 * Every pose write a gesture makes, in polls after the raise: the first pose over
 * `rise`, each later step over one poll (after the rise's hold), then home over
 * `fall`. The emitter and {@link MobModuleRef.preview} both read this, so the
 * preview can't drift from what the game is sent.
 */
function poseSchedule(g: Gesture, tickEvery: number): { poll: number; q: Quat | undefined; duration: number }[] {
  const steps = poses(g);
  const later = steps.slice(1).map((q, k) => ({ poll: hold(g) + k + 1, q, duration: tickEvery }));
  return [
    { poll: 0, q: steps[0], duration: g.rise ?? 0 },
    ...later,
    // A one-step gesture drops on the very next poll: its hold never applies.
    { poll: sequenced(g) ? hold(g) + steps.length + (g.linger ?? 0) : 1, q: undefined, duration: g.fall ?? 4 },
  ];
}

/** Walked down the cooldown clock, rather than dropped by the raised tag on the next poll. */
function sequenced(g: Gesture): boolean {
  return poses(g).length > 1 || (g.linger ?? 0) > 0;
}

/** A gesture's poses, as a sequence - the single-quat form is the one-step case. */
function poses(g: Gesture): Quat[] {
  return Array.isArray(g.rotate[0]) ? (g.rotate as Quat[]) : [g.rotate as Quat];
}

/** Start a custom-mob definition from the mob it really is and the model it wears. */
export function defineMob(nbt: IdentifiedEntityNbt, model: DisplayValue): MobBuilder {
  return new MobBuilder(nbt, model);
}
