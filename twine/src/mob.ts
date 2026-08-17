import { NbtPath, Nbt, Pos, Relation, Selector } from "helix";
import type {
  DamageType,
  Datapack,
  DisplayValue,
  FunctionContext,
  FunctionRef,
  Id,
  IdentifiedEntityNbt,
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
export class MobBuilder {
  private relay?: { damage: number; type?: DamageType };

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

  /** Compile to a drop-in {@link ConfiguredModule} (name = module / tag id). */
  toModule(name: string, opts: MobModuleOpts = {}): ConfiguredModule {
    const tickEvery = opts.tickEvery ?? 2;
    return defineModule(
      { name, tickEvery, dimension: opts.dimension },
      new MobModule(name, this.nbt, this.model, this.relay),
    );
  }

  /** The generated summon function, for a consumer calling it directly. */
  summonRef(dp: Datapack, name: string): FunctionRef {
    const ref = dp.functionRef(`${name}/summon`);
    if (!ref) {
      throw new Error(
        `Mob "${name}" has no summon function yet - its module registers late, so read this from onLoad/onTick, not a module constructor.`,
      );
    }
    return ref;
  }
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
  ) {}

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

    scope.fn(`${this.name}/summon`, (ctx) => {
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
  }

  onTick(ctx: FunctionContext): void {
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

/** Start a custom-mob definition from the mob it really is and the model it wears. */
export function defineMob(nbt: IdentifiedEntityNbt, model: DisplayValue): MobBuilder {
  return new MobBuilder(nbt, model);
}
