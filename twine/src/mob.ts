import {
  NbtPath,
  Nbt,
  Pos,
  Range,
  Relation,
  ScoreTarget,
  Selector,
  add,
  atLeast,
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
   * How near a player must be for the mob to run at all. Default `48`, checked once a
   * second.
   *
   * Keep it above the mob's `FOLLOW_RANGE` so it wakes before it aggros.
   */
  wakeRange?: number;
}

/**
 * Per-mob body, run as and at the mob. `mob` switches between its {@link
 * MobBuilder.states}.
 */
export type MobTick<S extends string = never> = (ctx: FunctionContext, dp: Datapack, mob: MobStates<S>) => void;

/**
 * One phase of a mob, e.g. airborne or stunned. A mob is in at most one state, stored as a
 * score.
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
 * A one-shot animation of rig members, e.g. a swing or a head tilt.
 *
 * Snaps to a rotation about a pivot, then interpolates back to rest.
 */
export interface Gesture<S extends string = never> {
  /** Which members move, as indices into the model's `members()` (root is 0). */
  members: number[];
  /** What they turn about, in the model's own coordinates (the group `offset` is added for you). */
  pivot: Vec3;
  /**
   * The rotation to raise to.
   *
   * An array is a sequence, one pose per poll, used for rotations too big for one snap (a
   * spin).
   * `cooldown` must be longer than the number of steps.
   */
  rotate: Quat | Quat[];
  /**
   * A rotation held for the whole gesture that turns members in place without moving them.
   *
   * Put it in `rotate` instead and the members' positions rotate too.
   */
  tilt?: Quat;
  /** Ticks the first pose takes to ease in, and how long it's held. Default `0`. */
  rise?: number;
  /**
   * Extra polls to hold the last pose before falling back. Default `0`. Needs a long enough
   * cooldown.
   */
  linger?: number;
  /** Ticks the fall takes (default `4`). A feel knob - shorter is snappier. */
  fall?: number;
  /** Ticks before it can fire again (default `20`). Ignored for manual calls. */
  cooldown?: number;
  /** When it fires, evaluated as the mob at its own position. Omit for manual-only. */
  when?: Detector;
  /**
   * Commands run with the gesture, as and at the mob, e.g. the hit that goes with a swing.
   *
   * See {@link fireAfter} to land it later in the animation.
   */
  onFire?: MobTick<S>;
  /**
   * Ticks after the raise that {@link onFire} runs. Default `0`.
   *
   * Needs a cooldown, and must land inside it.
   */
  fireAfter?: number;
  /**
   * Commands run {@link recoverAfter} ticks after the raise, e.g. reloading a crossbow.
   * Needs a cooldown, and must land inside it.
   */
  onRecover?: MobTick<S>;
  /** Ticks after the raise that {@link onRecover} lands. Default `0`. */
  recoverAfter?: number;
}

/**
 * Builds a custom mob: a vanilla mob does the AI, with a display-entity model riding it.
 *
 *   const sentinel = defineMob(Husk({ ... }), rig())
 *     .relayHits(4)
 *     .toModule("sentinel");
 *
 *   @Module({ name: "keep", imports: [sentinel] })
 *
 * The framework handles what riding doesn't:
 *
 * - Yaw: the mob's rotation is copied to the rig.
 * - Reach: {@link relayHits} turns hits on a `Display.hitbox(...)` into damage on the mob.
 * - Death: rigs whose mob is gone are removed.
 *
 * `<name>/summon` summons the mob where it's run; see {@link summonRef}.
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

  /** Turns hits on the model's hitbox into `damage` on the mob. The model needs a hitbox. */
  relayHits(damage: number, type?: DamageType): this {
    this.relay = { damage, type };
    return this;
  }

  /** Adds a gesture as a `<mob>/<name>` function, plus a trigger if it has `when`. */
  gesture(name: string, g: Gesture<S>): this {
    this.gestures.set(name, g);
    return this;
  }

  /**
   * The mob's states by name. Declare before gestures and `onTick` so state names are
   * typed.
   */
  states<T extends string>(defs: Record<T, MobState<NoInfer<T>>>): MobBuilder<T> {
    const self = this as unknown as MobBuilder<T>;
    self.stateDefs = new Map(Object.entries(defs) as [T, MobState<T>][]);
    return self;
  }

  /**
   * Your per-tick behaviour, run as and at each awake mob, so use `@s`.
   *
   * Runs before gestures and the yaw copy. Emitted as `<mob>/on_tick` (`onTickFn`), which
   * is what
   * to pass to `dp.allowNbtRead`.
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
    // Getters, because the functions don't exist until the module registers.
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

/** A mob module plus handles to its generated functions. Read them after registration. */
export interface MobModuleRef extends ConfiguredModule {
  /** Summons the mob wherever it is run - `ctx.execute().at(...).run(b => b.call(mob.summon))`. */
  readonly summon: FunctionRef;
  /** `<name>/spawn`: summons one at the nearest player. */
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
 * A mob rig as the game sees it: each member's rest transform, and every write each gesture
 * makes.
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
  private faceByRotate = false;

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
  /** One cooldown per gesture, so one gesture's cooldown doesn't block the others. */
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
      leave: (ctx) => states.stateObj.score(Selector.self()).set(0),
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

    // Yaw only: copying pitch would tilt the whole model.
    this.faceByRotate = atLeast(dp.version, "1.21.2");
    this.faceOne = scope.fn(privateName(`${this.name}/face_one`), (ctx) => {
      // `rotate` (1.21.2+): facing a point straight ahead copies the yaw without reading
      // NBT.
      const face = (b: FunctionContext) => b.rotate().facing(Selector.self(), Pos.local(0, 0, 1));
      // Passengers keep their own rotation, so every member must be turned, not just the
      // root.
      if (this.faceByRotate) {
        face(ctx);
        ctx.execute().on(Relation.PASSENGERS).run(face);
        return;
      }
      // Older versions copy Rotation[0] through NBT. The rig tags itself so it's still
      // findable
      // after `on vehicle` switches `@s`.
      const cur = `${this.name}.cur`;
      const me = Selector.allEntities().tag(cur).limit(1);
      ctx.tag().add(Selector.self(), cur);
      ctx
        .execute()
        .on(Relation.VEHICLE)
        .run((b) => b.entity(me).set(YAW, b.entity(Selector.self()).at(YAW)));
      ctx
        .execute()
        .on(Relation.PASSENGERS)
        .run((b) => b.entity(Selector.self()).set(YAW, b.entity(me).at(YAW)));
      ctx.tag().remove(Selector.self(), cur);
    });
    if (!this.faceByRotate) dp.allowNbtRead(this.faceOne, "rig yaw copy, awake mobs only");

    const summon = scope.fn(`${this.name}/summon`, (ctx) => {
      const fresh = this.freshTag;
      // Summoned separately and mounted, so the same rig can ride any mob.
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

    // The spawn command you type.
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
            this.cooldown(Selector.self(), gname).set(g.cooldown ?? 20);
          }
          this.poseMembers(ctx, undefined, g, poses(g)[0], g.rise ?? 0);
          if (!g.fireAfter) g.onFire?.(ctx, dp, this.handle);
        }),
      );
      // Cooldowns cap how often the gesture's bodies run, which the report can't see.
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

    this.awakeObj = dp.objective(`${this.name}.awake`);
    this.wake = scope.fn(privateName(`${this.name}/wake`), (ctx) => this.wakeBody(ctx));
    this.tickOne = dp.createFunction(privateName(`${this.name}/tick_one`));
    this.tickOne.build((ctx) => this.tickOneBody(ctx));
  }

  /**
   * Emits `<mob>/enter/<s>`, `<mob>/state/<s>` (and `/done` if timed), and the
   * `<mob>/state` dispatch.
   */
  private registerStates(dp: Datapack): void {
    if (!this.stateDefs.size) return;
    const state = this.stateObj.score(Selector.self());
    const clock = this.stateClockObj.score(Selector.self());
    const cases = [...this.stateDefs].map(([s, def], i) => {
      const idx = i + 1;
      this.fns.get(`enter/${s}`)!.build((ctx) => {
        state.set(idx);
        // Zeroed for an untimed state too, or a stale count would keep the mob awake in it.
        clock.set(def.polls ?? 0);
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
        if (done) clock.remove(1);
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
    // Dispatch on a copy, so a state that enters a later state doesn't also run it this
    // poll.
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
   * Merges a pose onto each moving member. Run as the mob.
   *
   * Walks `passengers` so only this mob's rig is touched. Member 0 is the root (one hop);
   * others
   * ride the root (two hops).
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

  /** One poll of gesture work for an awake mob. Firing is in {@link trigger}. */
  private tickGesture(ctx: FunctionContext, gname: string, g: Gesture<S>): void {
    const tag = this.gestureTag(gname);
    // The fall is emitted before the trigger, or a gesture started this tick would end
    // immediately.
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

  /**
   * `<mob>/<gesture>_clock`: one mob's countdown and everything timed from it. As and at
   * the mob.
   */
  private clockGesture(ctx: FunctionContext, gname: string, g: Gesture<S>): void {
    const tag = this.gestureTag(gname);
    this.cooldown(Selector.self(), gname).remove(1);
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

    // Sequences step down their own cooldown, so each mob animates independently.
    if (sequenced(g)) {
      // One function per step, picked by one dispatch on the clock.
      // Slerp takes the short way, so a sequence just short of a full turn finishes
      // forwards.
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
   * While no mob is near a player this costs a counter and a score check; entity scans run
   * in
   * {@link wakeBody}, once a second.
   */
  onTick(ctx: FunctionContext): void {
    const wake = this.awakeObj.score(ScoreTarget("#wake"));
    wake.add(1);
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
    // Stay awake while a gesture's clock runs, so walking away can't freeze it halfway.
    const clocks = [...this.gestures].filter(([, g]) => g.cooldown !== 0).map(([gname]) => this.cooldowns.get(gname)!);
    if (this.stateClockObj) clocks.push(this.stateClockObj);
    const finish = clocks.length
      ? this.internal("wake_finish", (c) => {
          c.tag().add(self, this.finishingTag);
          c.tag().add(self, this.awakeTag);
        })
      : undefined;
    // Mark-and-sweep orphaned rigs: live mobs clear their rig's mark, and anything still
    // marked is removed.
    // ponytail: runs once a second, so a dead mob's rig can linger up to a second.
    ctx.tag().add(this.rigRoots, this.orphanTag);
    // One scan to reset every mob (and claim its rig), then one per player for the ones near it.
    const one = this.internal("wake_one", (c) => {
      c.tag().remove(self, this.awakeTag);
      c.tag().remove(self, this.finishingTag);
      c.execute().on(Relation.PASSENGERS).run((b) => b.tag().remove(Selector.self(), this.orphanTag));
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
    // Rigs no mob claimed above lost their mob: kill them.
    ctx
      .execute()
      .as(this.rigRoots.tag(this.orphanTag))
      .run((b) => b.call(this.killRig));
    this.awakeObj.score(ScoreTarget("#wake")).set(0);
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
    const face = ctx.execute();
    if (this.faceByRotate) face.rotated(Pos.rel(0, Pos.abs(0)));
    face.on(Relation.PASSENGERS).ifEntity(Selector.self().tag(`${this.rig}_0`));
    if (this.faceByRotate) face.positionedAs(Selector.self());
    face.run((b) => b.call(this.faceOne));
    if (this.relay) this.relayHits(ctx, this.relay);
  }

  /**
   * Turns a hit on the interaction hitbox into damage on this mob.
   *
   * `on attacker` finds the hitter without reading NBT until there's a hit.
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

}

/**
 * A member's rest transform rotated about `pivot`: moves its position and turns its
 * orientation.
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
 * Extra polls the first pose is held for. Only `rise` beyond 1 shifts the step clock, so
 * `rise: 0` output is unchanged.
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
 * Every pose write a gesture makes, in polls after the raise.
 *
 * Both the emitter and {@link MobModuleRef.preview} use this, so the preview matches the
 * game.
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
