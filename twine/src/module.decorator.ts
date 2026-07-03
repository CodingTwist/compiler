import "reflect-metadata";
import type {
  ConfiguredModule,
  DatapackModule,
  ModuleClass,
  ModuleMetadata,
  ModuleRef,
} from "./module.interface";

const MODULE_META = Symbol("datapack:module");

/**
 * Marks a class as a datapack module and attaches its {@link ModuleMetadata}.
 * Mirrors NestJS's `@Module({ ... })` so the composition root reads familiarly:
 *
 * ```ts
 * @Module({ name: "timer", area: true, activeByDefault: true })
 * export class TimerModule implements DatapackModule { ... }
 *
 * @Module({ imports: [TimerModule, GreetingModule] })
 * export class AppModule {}
 * ```
 */
export function Module(meta: ModuleMetadata): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(MODULE_META, meta, target);
  };
}

/** Read back the metadata attached by {@link Module}; throws if absent. */
export function getModuleMetadata(target: ModuleClass): ModuleMetadata {
  const meta = Reflect.getMetadata(MODULE_META, target) as
    | ModuleMetadata
    | undefined;
  if (!meta) {
    throw new Error(
      `${target.name ?? "Module"} is missing @Module(...) metadata - did you forget the decorator?`,
    );
  }
  return meta;
}

/**
 * Build a {@link ConfiguredModule} from explicit metadata + a ready instance -
 * the building block of a `forFeature`-style factory:
 *
 * ```ts
 * export const Door = (cfg: DoorConfig) =>
 *   defineModule({ name: `door_${cfg.id}`, env: cfg.env }, new DoorFeature(cfg));
 * ```
 */
export function defineModule(
  metadata: ModuleMetadata,
  instance: DatapackModule,
): ConfiguredModule {
  return { __configured: true, metadata, instance };
}

/** True when `ref` is a {@link ConfiguredModule} rather than a module class. */
export function isConfiguredModule(ref: ModuleRef): ref is ConfiguredModule {
  return (ref as ConfiguredModule).__configured === true;
}
