import type { DamageType, DisplayValue, IdentifiedEntityNbt } from "helix";
import { Mob, type Relay } from "./emit";
import { resolveGesture, type Gesture } from "./gesture";
import type { MobDifficulty, MobOptions, MobState, MobTick } from "./types";

/**
 * Builds a custom mob: a vanilla mob does the AI, with a display-entity model riding it.
 *
 *   const sentinel = defineMob(Husk({ ... }), rig()).relayHits(4).build("sentinel");
 *   sentinel.register(dp);
 *   // then run `sentinel.wake` once a second and `sentinel.tick(ctx)` every 2 ticks
 *
 * It handles what riding doesn't:
 *
 * - Yaw: the mob's rotation is copied to the rig.
 * - Reach: {@link relayHits} turns hits on a `Display.hitbox(...)` into damage on the mob.
 * - Death: rigs whose mob is gone are removed.
 */
export class MobBuilder<S extends string = never> {
  private relay?: Relay;
  private readonly gestureDefs = new Map<string, Gesture<S>>();
  private tickBody?: MobTick<S>;
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
   * Needs the `difficulty(dp)` score seeded.
   */
  onDifficulty(body: MobDifficulty): this {
    this.difficultyBody = body;
    return this;
  }

  /** Adds a gesture as a `<mob>/<name>` function, plus a trigger if it has `when`. */
  gesture(name: string, g: Gesture<S>): this {
    this.gestureDefs.set(name, g);
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
    this.tickBody = body;
    return this;
  }

  /** The {@link Mob} named `name` (its tag and function folder). Throws if a gesture's timings don't fit. */
  build(name: string, opts: MobOptions = {}): Mob<S> {
    const tickEvery = opts.tickEvery ?? 2;
    return new Mob<S>({
      name,
      nbt: this.nbt,
      model: this.model,
      tickEvery,
      wakeRange: opts.wakeRange ?? 48,
      relay: this.relay,
      gestures: [...this.gestureDefs].map(([g, def]) => resolveGesture(g, def, tickEvery)),
      tick: this.tickBody,
      states: this.stateDefs,
      onDifficulty: this.difficultyBody,
    });
  }
}

/** Start a custom-mob definition from the mob it really is and the model it wears. */
export function defineMob(nbt: IdentifiedEntityNbt, model: DisplayValue): MobBuilder {
  return new MobBuilder(nbt, model);
}
