import { NbtPath, Pos, Range, Relation, ScoreTarget, Selector, atLeast, displayPose, privateName } from "helix";
import type {
  DamageType,
  Datapack,
  DisplayValue,
  FunctionContext,
  FunctionRef,
  IdentifiedEntityNbt,
  Objective,
  Quat,
  Score,
} from "helix";
import type { DatapackModule, ModuleScope } from "../core/module.interface";
import { DIFFICULTIES, DIFFICULTY, DIFFICULTY_IDS, type Difficulty } from "../core/difficulty";
import type { MobDifficulty, MobState, MobStates, MobTick } from "./builder";
import { memberPose, type ResolvedGesture } from "./gesture";

/** The yaw half of `Rotation` - index 1 is the pitch, which a rig must not copy. */
const YAW = NbtPath("Rotation[0]");

export type Relay = { damage: number; type?: DamageType };

/** Everything a {@link MobBuilder} collected, handed to the module it compiles to. */
export interface MobDef<S extends string> {
  name: string;
  nbt: IdentifiedEntityNbt;
  model: DisplayValue;
  tickEvery: number;
  wakeRange: number;
  relay?: Relay;
  gestures: ResolvedGesture<S>[];
  tick?: MobTick<S>;
  states: ReadonlyMap<string, MobState<S>>;
  /** Run as each mob at summon and whenever the pack's difficulty changes. */
  onDifficulty?: MobDifficulty;
}

/** The {@link DatapackModule} a {@link MobBuilder} compiles to. */
export class MobModule<S extends string> implements DatapackModule {
  private dp!: Datapack;
  /** Each generated function by short name (`summon`, a gesture), once registered. */
  private readonly fns = new Map<string, FunctionRef>();
  /** One cooldown per gesture, so one gesture's cooldown doesn't block the others. */
  private readonly cooldowns = new Map<string, Objective>();
  /** `#wake` counts polls to the next wake; `#awake` is how many mobs it found. */
  private awakeObj!: Objective;
  /** `<mob>.state`: the 1-based index of the state a mob is in, 0 for none. */
  private stateObj!: Objective;
  /** `<mob>.state_t`: polls left in a timed state. */
  private stateClockObj?: Objective;
  private handle!: MobStates<S>;
  /** Numbers the functions each {@link MobStates.byDifficulty} call emits. */
  private byDifficultyCalls = 0;
  /** `rotate` (1.21.2+) turns the rig without reading NBT. */
  private faceByRotate = false;

  constructor(private readonly def: MobDef<S>) {}

  fnRef(short: string): FunctionRef {
    const ref = this.fns.get(short);
    if (!ref) {
      throw new Error(
        `Mob "${this.def.name}" has no "${short}" function yet - it registers after the module importing it, so read this from onLoad/onTick, not a constructor.`,
      );
    }
    return ref;
  }

  private get name(): string {
    return this.def.name;
  }
  /** The rig's group name - every member is tagged with it (see `Display.named`). */
  private get rig(): string {
    return `${this.name}_rig`;
  }
  private get mobs(): Selector {
    return Selector.allEntities().type(this.def.nbt.entity).tag(this.name);
  }
  /** Member 0 is the group root: the entity that actually rides the mob. */
  private get rigRoots(): Selector {
    const root = this.def.model.members()[0].content.kind;
    return Selector.allEntities().type(`minecraft:${root}_display`).tag(`${this.rig}_0`);
  }
  private get awakeTag(): string {
    return `${this.name}.awake`;
  }
  /** Awake only to finish a gesture: no player near, so nothing new may fire. */
  private get finishingTag(): string {
    return `${this.name}.finishing`;
  }
  /** Worn while a gesture is raised - cleared next tick, which starts the fall. */
  private gestureTag(g: ResolvedGesture<S>): string {
    return `${this.name}.${g.name}`;
  }
  private cooldown(g: ResolvedGesture<S>): Score {
    return this.cooldowns.get(g.name)!.score(Selector.self());
  }

  /** Records `fn` under `short` for {@link fnRef}. */
  private add(short: string, fn: FunctionRef): FunctionRef {
    this.fns.set(short, fn);
    return fn;
  }

  /** A function only this mob's own tick tree calls: no dimension wrap, since it inherits the caller's. */
  private internal(short: string, body: (ctx: FunctionContext) => void): FunctionRef {
    const fn = this.dp.createFunction(privateName(`${this.name}/${short}`));
    fn.build(body);
    return fn;
  }

  register(dp: Datapack, scope: ModuleScope): void {
    this.dp = dp;
    const { model, gestures, states } = this.def;
    model.named(this.rig);

    // Before any author body is built: they all take the switch.
    if (states.size) {
      this.stateObj = dp.objective(`${this.name}.state`);
      this.stateClockObj = dp.objective(`${this.name}.state_t`);
      for (const s of states.keys()) this.add(`enter/${s}`, dp.createFunction(`${this.name}/enter/${s}`));
    }
    const mob = this;
    this.handle = {
      enter: (ctx, s) => ctx.call(this.fnRef(`enter/${s}`)),
      leave: () => this.stateObj.score(Selector.self()).set(0),
      byDifficulty: (ctx, body) => ctx.call(this.byDifficulty(`by_difficulty_${this.byDifficultyCalls++}`, body)),
      get clock() {
        if (!mob.stateClockObj) throw new Error(`Mob "${mob.name}" has no states - declare them with .states() to use the clock.`);
        return mob.stateClockObj.score(Selector.self());
      },
    };

    this.awakeObj = dp.objective(`${this.name}.awake`);
    this.registerSummon(scope);
    this.faceByRotate = atLeast(dp.version, "1.21.2");
    for (const g of gestures) this.registerGesture(dp, scope, g);
    if (this.def.tick) {
      const body = this.def.tick;
      this.add("on_tick", scope.fn(privateName(`${this.name}/on_tick`), (ctx) => body(ctx, dp, this.handle)));
    }
    this.registerStates(dp);

    this.add("wake", scope.fn(privateName(`${this.name}/wake`), (ctx) => this.wakeBody(ctx, scope)));
    this.add("tick_one", this.internal("tick_one", (ctx) => this.tickOneBody(ctx, scope)));
  }

  /** Emits `<mob>/summon` */
  private registerSummon(scope: ModuleScope): void {
    const fresh = `${this.name}.new`;
    const summon = this.add(
      "summon",
      scope.fn(`${this.name}/summon`, (ctx) => {
        // Summoned separately and mounted, so the same rig can ride any mob.
        ctx.summon(this.def.nbt.tagged(this.name, fresh), Pos.rel(0, 0, 0));
        ctx.summon(this.def.model.toNbt().tagged(fresh), Pos.rel(0, 0, 0));
        ctx
          .execute()
          .as(Selector.allEntities().tag(`${this.rig}_0`).tag(fresh))
          .run((b) => b.ride().mount(Selector.self(), Selector.allEntities().tag(this.name).tag(fresh).limit(1)));
        const scale = this.onDifficultyFn();
        if (scale) ctx.execute().as(Selector.allEntities().tag(this.name).tag(fresh).limit(1)).run((b) => b.call(scale));
        ctx.tag().remove(Selector.allEntities().tag(fresh), fresh);
      }),
    );
  }

  /** `<mob>/on_difficulty`: the author's {@link MobDef.onDifficulty} for the current level, registered once. */
  private onDifficultyFn(): FunctionRef | undefined {
    const body = this.def.onDifficulty;
    if (!body) return undefined;
    if (!this.fns.has("on_difficulty")) this.add("on_difficulty", this.byDifficulty("on_difficulty", (c, level) => body(c, this.dp, level)));
    return this.fns.get("on_difficulty");
  }

  /**
   * `<mob>/<short>`: runs `body` for the pack's difficulty level, built once per level.
   *
   * Its own function because the dispatch returns, which would cut off the caller's later commands.
   */
  private byDifficulty(short: string, body: (ctx: FunctionContext, level: Difficulty) => void): FunctionRef {
    const cases = DIFFICULTIES.map((level) => ({
      range: Range.exactly(DIFFICULTY_IDS[level]),
      fn: this.internal(`${short}/${level}`, (c) => body(c, level)),
    }));
    return this.internal(short, (c) => c.dispatchScore(DIFFICULTY, cases));
  }

  /** Emits a gesture's raise function, its delayed bodies, and its clock. */
  private registerGesture(dp: Datapack, scope: ModuleScope, g: ResolvedGesture<S>): void {
    this.cooldowns.set(g.name, dp.objective(`${this.name}.${g.name}`));
    // Delayed bodies get their own function, so the tick pays one call only for mobs mid-swing.
    if (g.fireAfter) {
      this.add(`${g.name}_hit`, scope.fn(privateName(`${this.name}/${g.name}_hit`), (ctx) => g.onFire?.(ctx, dp, this.handle)));
    }
    if (g.onRecover) {
      const body = g.onRecover;
      this.add(`${g.name}_recover`, scope.fn(privateName(`${this.name}/${g.name}_recover`), (ctx) => body(ctx, dp, this.handle)));
    }
    this.add(
      g.name,
      scope.fn(`${this.name}/${g.name}`, (ctx) => {
        ctx.tag().add(Selector.self(), this.gestureTag(g));
        if (g.cooldown !== 0) this.cooldown(g).set(g.cooldown);
        this.poseMembers(ctx, undefined, g, g.steps[0], g.rise);
        if (!g.fireAfter) g.onFire?.(ctx, dp, this.handle);
      }),
    );
    // Cooldowns cap how often the gesture's bodies run, which the report can't see.
    if (g.when && g.cooldown >= 5) {
      for (const fn of [g.name, `${g.name}_hit`, `${g.name}_recover`]) {
        if (this.fns.has(fn)) dp.allowNbtRead(this.fns.get(fn)!, `at most once per ${g.cooldown}-tick cooldown`);
      }
    }
    // The clock-driven half runs only for a mob whose clock is running.
    if (g.cooldown !== 0) {
      const clock = this.add(`${g.name}_clock`, dp.createFunction(privateName(`${this.name}/${g.name}_clock`)));
      clock.build((ctx) => this.clockGesture(ctx, g));
    }
  }

  /** Emits `<mob>/enter/<s>`, `<mob>/state/<s>` (and `/done` if timed), and the `<mob>/state` dispatch. */
  private registerStates(dp: Datapack): void {
    if (!this.def.states.size) return;
    const state = this.stateObj.score(Selector.self());
    const clock = this.stateClockObj!.score(Selector.self());
    const cases = [...this.def.states].map(([s, def], i) => {
      const idx = i + 1;
      this.fnRef(`enter/${s}`).build((ctx) => {
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
      this.add("state", cases[0].fn);
      return;
    }
    // Dispatch on a copy, so a state that enters a later state doesn't also run it this poll.
    const current = this.stateObj.score(ScoreTarget(`#${this.name}_state`));
    this.add(
      "state",
      this.internal("state", (ctx) => {
        current.assign(state, ctx);
        ctx.dispatchScore(current, cases);
      }),
    );
  }

  /**
   * Merges a pose onto each moving member. Run as the mob.
   *
   * Walks `passengers` so only this mob's rig is touched. Member 0 is the root (one hop);
   * others ride the root (two hops).
   */
  private poseMembers(
    ctx: FunctionContext,
    /** Who to pose, or `undefined` for `@s` itself - no `as` hop. */
    self: Selector | undefined,
    g: ResolvedGesture<S>,
    /** The rotation to hold, or `undefined` for the model's own rest pose. */
    q: Quat | undefined,
    duration: number,
  ): void {
    for (const i of g.members) {
      const chain = ctx.execute();
      if (self) chain.as(self);
      chain.on(Relation.PASSENGERS);
      if (i !== 0) chain.on(Relation.PASSENGERS);
      chain.run((b) =>
        b
          .data()
          .merge()
          .entity(Selector.self().tag(`${this.rig}_${i}`), displayPose(memberPose(this.def.model, g, i, q), duration)),
      );
    }
  }

  /** `<mob>/<gesture>_clock`: one mob's countdown and everything timed from it. As and at the mob. */
  private clockGesture(ctx: FunctionContext, g: ResolvedGesture<S>): void {
    this.cooldown(g).remove(1);
    // A beat on the clock: this mob, exactly `after` polls past its raise.
    const onBeat = (after: number, fn: string) =>
      ctx
        .execute()
        .ifScoreMatches(this.cooldown(g), Range.exactly(g.cooldown - after))
        .run((b) => b.call(this.fnRef(fn)));
    if (g.fireAfter) onBeat(g.fireAfter, `${g.name}_hit`);
    if (g.onRecover) onBeat(g.recoverAfter, `${g.name}_recover`);

    // Sequences step down their own cooldown, so each mob animates independently. Slerp takes
    // the short way, so a sequence just short of a full turn still finishes forwards.
    if (g.sequenced) {
      const later = g.schedule.slice(1);
      const cases = later.map((w, k) => ({
        range: Range.exactly(g.cooldown - w.poll),
        fn: this.internal(`${g.name}_step_${k + 1}`, (c) => {
          this.poseMembers(c, undefined, g, w.q, w.duration);
          if (k === later.length - 1) c.tag().remove(Selector.self(), this.gestureTag(g));
        }),
      }));
      ctx.call(this.internal(`${g.name}_pose`, (c) => c.dispatchScore(this.cooldown(g), cases)));
    }
  }

  /** While no mob is near a player this costs a counter and a score check; scans run in `wake`, once a second. */
  onTick(ctx: FunctionContext): void {
    const wake = this.awakeObj.score(ScoreTarget("#wake"));
    wake.add(1);
    ctx
      .execute()
      .ifScoreMatches(wake, Range.atLeast(Math.ceil(20 / this.def.tickEvery)))
      .run((b) => b.call(this.fnRef("wake")));
    ctx
      .execute()
      .ifScoreMatches(this.awakeObj.score(ScoreTarget("#awake")), Range.atLeast(1))
      .as(this.mobs.tag(this.awakeTag))
      .at(Selector.self())
      .run((b) => b.call(this.fnRef("tick_one")));
  }

  /** `<mob>/wake`: tag the mobs worth running, count them, and sweep orphaned rigs. */
  private wakeBody(ctx: FunctionContext, scope: ModuleScope): void {
    const self = Selector.self();
    const orphan = `${this.name}.orphan`;
    // Stay awake while a gesture's or state's clock runs, so walking away can't freeze it halfway.
    const clocks = this.def.gestures.filter((g) => g.cooldown !== 0).map((g) => this.cooldowns.get(g.name)!);
    if (this.stateClockObj) clocks.push(this.stateClockObj);
    const finish = clocks.length
      ? this.internal("wake_finish", (c) => {
          c.tag().add(self, this.finishingTag);
          c.tag().add(self, this.awakeTag);
        })
      : undefined;
    // Mark-and-sweep orphaned rigs: live mobs clear their rig's mark, and anything still marked is removed.
    // ponytail: runs once a second, so a dead mob's rig can linger up to a second.
    ctx.tag().add(this.rigRoots, orphan);
    // One scan to reset every mob (and claim its rig), then one per player for the ones near it.
    const one = this.internal("wake_one", (c) => {
      c.tag().remove(self, this.awakeTag);
      c.tag().remove(self, this.finishingTag);
      c.execute().on(Relation.PASSENGERS).run((b) => b.tag().remove(Selector.self(), orphan));
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
    if (this.def.onDifficulty) this.watchDifficulty(ctx);
    ctx
      .execute()
      .at(Selector.allPlayers())
      .as(this.mobs.distance(Range.atMost(this.def.wakeRange)))
      .run((b) => b.call(near));
    ctx
      .execute()
      .storeResultScore(this.awakeObj.score(ScoreTarget("#awake")))
      .ifEntity(this.mobs.tag(this.awakeTag))
      .done();
    // Rigs no mob claimed above lost their mob: kill them, passengers first, since killing a
    // vehicle only dismounts its riders.
    const killRig = scope.fn(privateName(`${this.name}/kill_rig`), (c) => {
      c.execute().on(Relation.PASSENGERS).run((b) => b.kill(Selector.self()));
      c.kill(Selector.self());
    });
    ctx
      .execute()
      .as(this.rigRoots.tag(orphan))
      .run((b) => b.call(killRig));
    this.awakeObj.score(ScoreTarget("#wake")).set(0);
  }

  /** `<mob>/tick_one`: everything one awake mob does per poll, as it, at it. */
  private tickOneBody(ctx: FunctionContext, scope: ModuleScope): void {
    // Yours first: it decides what the gestures' triggers and the yaw copy then see.
    if (this.def.tick) ctx.call(this.fnRef("on_tick"));
    // Then the state, if any: one check for a mob in none.
    if (this.def.states.size) {
      ctx
        .execute()
        .ifScoreMatches(this.stateObj.score(Selector.self()), Range.atLeast(1))
        .run((b) => b.call(this.fnRef("state")));
    }
    for (const g of this.def.gestures) {
      // The fall is emitted before the trigger, or a gesture started this tick would end immediately.
      if (!g.sequenced) {
        this.poseMembers(ctx, Selector.self().tag(this.gestureTag(g)), g, undefined, g.fall);
        ctx.tag().remove(Selector.self().tag(this.gestureTag(g)), this.gestureTag(g));
      }
      if (g.cooldown !== 0) {
        ctx
          .execute()
          .ifScoreMatches(this.cooldown(g), Range.atLeast(1))
          .run((b) => b.call(this.fnRef(`${g.name}_clock`)));
      }
    }
    this.triggers(ctx);
    this.face(ctx, scope);
    if (this.def.relay) this.relayHits(ctx, this.def.relay);
  }

  /** Reruns `on_difficulty` on every live mob when the pack's difficulty changed since last applied. */
  private watchDifficulty(ctx: FunctionContext): void {
    const applied = this.awakeObj.score(ScoreTarget("#applied"));
    const rescale = this.internal("rescale", (c) => {
      c.execute().as(this.mobs).run((b) => b.call(this.onDifficultyFn()!));
      c.scoreOp(applied, "=", DIFFICULTY);
    });
    ctx.execute().unlessScore(DIFFICULTY, "=", applied).run((b) => b.call(rescale));
  }

  /** Every gesture trigger, behind one finishing check: a finishing mob fires nothing new. */
  private triggers(ctx: FunctionContext): void {
    const triggers = this.def.gestures.filter((g) => g.when);
    const fire = (c: FunctionContext, g: ResolvedGesture<S>, guard: boolean) => {
      const chain = c.execute();
      if (guard) chain.unlessEntity(Selector.self().tag(this.finishingTag));
      if (g.cooldown !== 0) chain.unlessScoreMatches(this.cooldown(g), Range.atLeast(1));
      g.when!(chain);
      chain.run((b) => b.call(this.fnRef(g.name)));
    };
    if (triggers.length === 1) {
      fire(ctx, triggers[0], true);
    } else if (triggers.length > 1) {
      const all = this.internal("triggers", (c) => triggers.forEach((g) => fire(c, g, false)));
      ctx
        .execute()
        .unlessEntity(Selector.self().tag(this.finishingTag))
        .run((b) => b.call(all));
    }
  }

  /** Points the rig the way this mob is facing. Yaw only: copying pitch would tilt the whole model. */
  private face(ctx: FunctionContext, scope: ModuleScope): void {
    const faceOne = scope.fn(privateName(`${this.name}/face_one`), (c) => {
      // Passengers keep their own rotation, so every member must be turned, not just the root.
      if (this.faceByRotate) {
        // Facing a point straight ahead copies the yaw without reading NBT.
        const turn = (b: FunctionContext) => b.rotate().facing(Selector.self(), Pos.local(0, 0, 1));
        turn(c);
        c.execute().on(Relation.PASSENGERS).run(turn);
        return;
      }
      // Older versions copy Rotation[0] through NBT. The rig tags itself so it's still
      // findable after `on vehicle` switches `@s`.
      const cur = `${this.name}.cur`;
      const me = Selector.allEntities().tag(cur).limit(1);
      c.tag().add(Selector.self(), cur);
      c.execute()
        .on(Relation.VEHICLE)
        .run((b) => b.entity(me).set(YAW, b.entity(Selector.self()).at(YAW)));
      c.execute()
        .on(Relation.PASSENGERS)
        .run((b) => b.entity(Selector.self()).set(YAW, b.entity(me).at(YAW)));
      c.tag().remove(Selector.self(), cur);
    });
    if (!this.faceByRotate) this.dp.allowNbtRead(faceOne, "rig yaw copy, awake mobs only");

    const chain = ctx.execute();
    if (this.faceByRotate) chain.rotated(Pos.rel(0, Pos.abs(0)));
    chain.on(Relation.PASSENGERS).ifEntity(Selector.self().tag(`${this.rig}_0`));
    if (this.faceByRotate) chain.positionedAs(Selector.self());
    chain.run((b) => b.call(faceOne));
  }

  /** Turns a hit on the interaction hitbox into damage on this mob. `on attacker` finds the hitter without reading NBT. */
  private relayHits(ctx: FunctionContext, relay: Relay): void {
    const attacked = this.internal("attacked", (c) => c.execute().on(Relation.ATTACKER).run((b) => b.return_(1)));
    const hit = this.internal("relay_hit", (c) => {
      c.execute()
        .on(Relation.VEHICLE)
        .on(Relation.VEHICLE)
        .run((b) => b.damage(Selector.self(), relay.damage, relay.type));
      // ponytail: one relayed hit per poll - the record only keeps the last one.
      c.entity(Selector.self()).remove(NbtPath("attack"));
    });
    ctx
      .execute()
      .on(Relation.PASSENGERS)
      .on(Relation.PASSENGERS)
      .ifEntity(Selector.self().tag(`${this.rig}_hitbox`))
      .ifFunction(attacked)
      .run((b) => b.call(hit));
  }
}
