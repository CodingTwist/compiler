import type { DamageType, Datapack, DisplayValue, FunctionContext, FunctionRef, Id, IdentifiedEntityNbt, Score } from "helix";
import type { ConfiguredModule } from "../core/module.interface";
import { defineModule } from "../core/module.decorator";
import type { DifficultyConfig, LevelScaling } from "../core/difficulty";
import { mobPreview, resolveGesture, type Gesture, type MobPreview } from "./gesture";
import { MobModule, type Relay } from "./module";

export type { Gesture, MobPreview } from "./gesture";

/** Extra module metadata `toModule` passes straight through. */
export interface MobModuleOpts {
  /** Upkeep period in ticks (default `2`). */
  tickEvery?: number;
  dimension?: Id;
  /**
   * How near a player must be for the mob to run at all. Default `48`, checked once a second.
   *
   * Keep it above the mob's `FOLLOW_RANGE` so it wakes before it aggros.
   */
  wakeRange?: number;
}

/** Per-mob body, run as and at the mob. `mob` switches between its {@link MobBuilder.states}. */
export type MobTick<S extends string = never> = (ctx: FunctionContext, dp: Datapack, mob: MobStates<S>) => void;

/** One phase of a mob, e.g. airborne or stunned. A mob is in at most one state, stored as a score. */
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
  /**
   * Runs `body` for the world's current difficulty, e.g. `damage(..., 6 * s.damage)`.
   *
   * Built once per level, so `if (table[s.level]?.shockwave === false) return` drops a feature.
   * Without a {@link MobBuilder.difficulty} table it runs once, as `medium`.
   */
  scaled(ctx: FunctionContext, body: (ctx: FunctionContext, s: LevelScaling) => void): void;
  /** Polls left in the current timed state, on `@s` - what phases within a state test. */
  readonly clock: Score;
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
 * `<name>/summon` summons the mob where it's run; see {@link MobModuleRef.summon}.
 */
export class MobBuilder<S extends string = never> {
  private relay?: Relay;
  private readonly gestures = new Map<string, Gesture<S>>();
  private tick?: MobTick<S>;
  private stateDefs = new Map<string, MobState<S>>();
  private scaling?: DifficultyConfig;

  constructor(
    private readonly nbt: IdentifiedEntityNbt,
    private readonly model: DisplayValue,
  ) {}

  /** Turns hits on the model's hitbox into `damage` on the mob. The model needs a hitbox. */
  relayHits(damage: number, type?: DamageType): this {
    this.relay = { damage, type };
    return this;
  }

  /** This mob's scaling per difficulty level. Usually imported from a config file. */
  difficulty(scaling: DifficultyConfig): this {
    this.scaling = scaling;
    return this;
  }

  /** Adds a gesture as a `<mob>/<name>` function, plus a trigger if it has `when`. */
  gesture(name: string, g: Gesture<S>): this {
    this.gestures.set(name, g);
    return this;
  }

  /** The mob's states by name. Declare before gestures and `onTick` so state names are typed. */
  states<T extends string>(defs: Record<T, MobState<NoInfer<T>>>): MobBuilder<T> {
    const self = this as unknown as MobBuilder<T>;
    self.stateDefs = new Map(Object.entries(defs) as [T, MobState<T>][]);
    return self;
  }

  /**
   * Your per-tick behaviour, run as and at each awake mob, so use `@s`.
   *
   * Runs before gestures and the yaw copy. Emitted as `<mob>/on_tick` (`onTickFn`), which is
   * what to pass to `dp.allowNbtRead`.
   */
  onTick(body: MobTick<S>): this {
    this.tick = body;
    return this;
  }

  /** Compile to a drop-in {@link ConfiguredModule} (name = module / tag id). */
  toModule(name: string, opts: MobModuleOpts = {}): MobModuleRef {
    const tickEvery = opts.tickEvery ?? 2;
    const gestures = [...this.gestures].map(([g, def]) => resolveGesture(g, def, tickEvery));
    const mob = new MobModule<S>({
      name,
      nbt: this.nbt,
      model: this.model,
      tickEvery,
      wakeRange: opts.wakeRange ?? 48,
      relay: this.relay,
      gestures,
      tick: this.tick,
      states: this.stateDefs,
      scaling: this.scaling,
    });
    const mod = defineModule({ name, tickEvery, dimension: opts.dimension }, mob) as MobModuleRef;
    const refs = (keys: string[], short: (k: string) => string) => Object.fromEntries(keys.map((k) => [k, mob.fnRef(short(k))]));
    // Getters, because the functions don't exist until the module registers.
    Object.defineProperties(mod, {
      summon: { get: () => mob.fnRef("summon"), enumerable: true },
      spawn: { get: () => mob.fnRef("spawn"), enumerable: true },
      onTickFn: { get: () => mob.fnRef("on_tick"), enumerable: true },
      gestures: { get: () => refs([...this.gestures.keys()], (g) => g), enumerable: true },
      states: { get: () => refs([...this.stateDefs.keys()], (s) => `enter/${s}`), enumerable: true },
      preview: { value: () => mobPreview(this.model, gestures, tickEvery) },
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

/** Start a custom-mob definition from the mob it really is and the model it wears. */
export function defineMob(nbt: IdentifiedEntityNbt, model: DisplayValue): MobBuilder {
  return new MobBuilder(nbt, model);
}
