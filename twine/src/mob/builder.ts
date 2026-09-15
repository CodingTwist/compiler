import { TICKS_PER_SECOND } from "helix";
import type { FunctionContext } from "helix";
import { MobBuilder as SpoolMobBuilder, type MobState } from "spool/plugins/mob";
import { every } from "../core/events";
import { defineModule } from "../core/module.decorator";
import type { DatapackModule } from "../core/module.interface";
import type { MobModuleOpts, MobModuleRef } from "./types";

/**
 * Builds a custom mob as a twine module; the mob itself is spool's `mob` plugin.
 *
 *   const sentinel = defineMob(Husk({ ... }), rig())
 *     .relayHits(4)
 *     .toModule("sentinel");
 *
 *   @Module({ name: "keep", imports: [sentinel] })
 *
 * `<name>/summon` summons the mob where it's run; see {@link MobModuleRef.summon}.
 */
export class MobBuilder<S extends string = never> extends SpoolMobBuilder<S> {
  override states<T extends string>(defs: Record<T, MobState<NoInfer<T>>>): MobBuilder<T> {
    return super.states(defs) as unknown as MobBuilder<T>;
  }

  /** Compile to a drop-in module (name = module / tag id) that registers and schedules the mob. */
  toModule(name: string, opts: MobModuleOpts = {}): MobModuleRef {
    const mob = this.build(name, opts);
    const module: DatapackModule = {
      register: (dp, scope) => mob.register(dp, (n, body) => scope.fn(n, body)),
      onTick: (ctx: FunctionContext) => mob.tick(ctx),
    };
    // On the shared clock, so each mob's scans get their own phase instead of all firing on one tick.
    every(module, TICKS_PER_SECOND, (c) => c.call(mob.wake));
    const mod = defineModule(
      { name, tickEvery: opts.tickEvery ?? 2, dimension: opts.dimension },
      module,
    );
    // Getters, because the functions don't exist until the module registers.
    const forward = (key: "summon" | "spawn" | "onTickFn" | "gestures" | "states") => ({
      get: () => mob[key],
      enumerable: true,
    });
    return Object.defineProperties(mod, {
      summon: forward("summon"),
      spawn: forward("spawn"),
      onTickFn: forward("onTickFn"),
      gestures: forward("gestures"),
      states: forward("states"),
      preview: { value: () => mob.preview() },
    }) as MobModuleRef;
  }
}

/** Start a custom-mob definition from the mob it really is and the model it wears. */
export function defineMob(
  ...args: ConstructorParameters<typeof SpoolMobBuilder>
): MobBuilder {
  return new MobBuilder(...args);
}
