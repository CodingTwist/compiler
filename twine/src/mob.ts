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
  /** How far, held for the raise. Falling back to rest is the visible half. */
  rotate: Quat;
  /** Ticks the fall takes (default `4`). A feel knob - shorter is snappier. */
  fall?: number;
  /** Ticks before it can fire again (default `20`). Ignored for manual calls. */
  cooldown?: number;
  /** When it fires, evaluated as the mob at its own position. Omit for manual-only. */
  when?: Detector;
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
    const mob = new MobModule(name, this.nbt, this.model, this.relay, this.gestures);
    const mod = defineModule({ name, tickEvery, dimension: opts.dimension }, mob) as MobModuleRef;
    // Getters, not values: the functions don't exist until the module registers,
    // which is after the importing module has built this.
    Object.defineProperties(mod, {
      summon: { get: () => mob.fnRef("summon"), enumerable: true },
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

    if (this.gestures.size) this.cooldowns = dp.objective(`${this.name}.gest`);
    for (const [gname, g] of this.gestures) {
      this.fns.set(
        gname,
        scope.fn(`${this.name}/${gname}`, (ctx) => {
          ctx.tag().add(Selector.self(), this.gestureTag(gname));
          if (g.cooldown !== 0) {
            this.cooldown(Selector.self()).set(g.cooldown ?? 20, ctx);
          }
          this.poseMembers(ctx, Selector.self(), g, true, 0);
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
   * Merge one pose onto each moving member. Run as the mob: `passengers` twice is
   * mob -> rig root -> its own members, so this only ever touches *this* mob's rig
   * (a tag alone would hit every one of them).
   */
  private poseMembers(
    ctx: FunctionContext,
    self: Selector,
    g: Gesture,
    raised: boolean,
    duration: number,
  ): void {
    const members = this.model.members();
    const pivot = add(g.pivot, this.model.getOffset());
    for (const i of g.members) {
      const rest = members[i]?.transform;
      if (!rest) throw new Error(`Gesture member ${i} is not a member of "${this.name}"'s model.`);
      ctx
        .execute()
        .as(self)
        .on(Relation.PASSENGERS)
        .on(Relation.PASSENGERS)
        .run((b) =>
          b
            .data()
            .merge()
            .entity(
              Selector.self().tag(`${this.rig}_${i}`),
              displayPose(raised ? raise(rest, pivot, g.rotate) : rest, duration),
            ),
        );
    }
  }

  private tickGesture(ctx: FunctionContext, gname: string, g: Gesture): void {
    const tag = this.gestureTag(gname);
    const raisedMobs = () => Selector.allEntities().tag(this.name).tag(tag);
    // The fall is emitted *before* the trigger, or a gesture started this tick
    // would be dropped again by its own end in the same function body.
    this.poseMembers(ctx, raisedMobs(), g, false, g.fall ?? 4);
    ctx.tag().remove(raisedMobs(), tag);

    if (g.cooldown !== 0) {
      // Only the ones actually counting down: `remove` on an unset score would
      // start one at -1 and run it down forever.
      this.cooldown(
        Selector.allEntities().tag(this.name).score(this.cooldowns!, new Range(1, undefined)),
      ).remove(1, ctx);
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
function raise(rest: Transform, pivot: Vec3, q: Quat): Transform {
  return {
    ...rest,
    translation: rotateAboutPivot(rest.translation ?? [0, 0, 0], pivot, q).map(round6) as Vec3,
    leftRotation: mulQuat(q, rest.leftRotation ?? [0, 0, 0, 1]).map(round6) as Quat,
  };
}

/** Start a custom-mob definition from the mob it really is and the model it wears. */
export function defineMob(nbt: IdentifiedEntityNbt, model: DisplayValue): MobBuilder {
  return new MobBuilder(nbt, model);
}
