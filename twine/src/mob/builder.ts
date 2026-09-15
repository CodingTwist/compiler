// `defineMob` and its chainable builder.
import type { DamageType, DisplayValue, IdentifiedEntityNbt } from "helix";
import type { ConfiguredModule } from "../core/module.interface";
import { defineModule } from "../core/module.decorator";
import { resolveGesture, type Gesture } from "./gesture";
import { MobModule, type Relay } from "./module";
import { mobPreview } from "./preview/rig";
import type {
  MobDifficulty,
  MobModuleOpts,
  MobModuleRef,
  MobState,
  MobTick,
} from "./types";

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
  private difficultyBody?: MobDifficulty;

  constructor(
    private readonly nbt: IdentifiedEntityNbt,
    private readonly model: DisplayValue,
  ) {}

  /** Turns hits on the model's hitbox into `damage` on the mob. The model needs a hitbox. */
  relayHits(damage: number, type?: DamageType): this {
    this.relay = { damage, type };
    return this;
  }

  /**
   * Runs `body` as each mob at summon, and on every live mob within a second of the difficulty changing.
   *
   * Where attribute modifiers go; remove before adding, since re-adding an existing modifier fails.
   */
  onDifficulty(body: MobDifficulty): this {
    this.difficultyBody = body;
    return this;
  }

  /** Adds a gesture as a `<mob>/<name>` function, plus a trigger if it has `when`. */
  gesture(name: string, g: Gesture<S>): this {
    this.gestures.set(name, g);
    return this;
  }

  /** The mob's states by name. Declare before gestures and `onTick` so state names are typed. */
  states<T extends string>(
    defs: Record<T, MobState<NoInfer<T>>>,
  ): MobBuilder<T> {
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
    const gestures = [...this.gestures].map(([g, def]) =>
      resolveGesture(g, def, tickEvery),
    );
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
      onDifficulty: this.difficultyBody,
    });
    const mod = defineModule(
      { name, tickEvery, dimension: opts.dimension },
      mob,
    ) as MobModuleRef;
    const refs = (keys: string[], short: (k: string) => string) =>
      Object.fromEntries(keys.map((k) => [k, mob.fnRef(short(k))]));
    // Getters, because the functions don't exist until the module registers.
    Object.defineProperties(mod, {
      summon: { get: () => mob.fnRef("summon"), enumerable: true },
      spawn: { get: () => mob.fnRef("spawn"), enumerable: true },
      onTickFn: { get: () => mob.fnRef("on_tick"), enumerable: true },
      gestures: {
        get: () => refs([...this.gestures.keys()], (g) => g),
        enumerable: true,
      },
      states: {
        get: () => refs([...this.stateDefs.keys()], (s) => `enter/${s}`),
        enumerable: true,
      },
      preview: { value: () => mobPreview(this.model, gestures, tickEvery) },
    });
    return mod;
  }
}

/** Start a custom-mob definition from the mob it really is and the model it wears. */
export function defineMob(
  nbt: IdentifiedEntityNbt,
  model: DisplayValue,
): MobBuilder {
  return new MobBuilder(nbt, model);
}
