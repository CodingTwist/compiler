import type { Datapack, FunctionRef, Id } from "helix";
import type { FunctionContext } from "helix";
import type { AreaTrigger } from "./area";

export type { AreaTrigger, Vec3, Zone } from "./area";

/**
 * A datapack module is a class with an optional constructor and the lifecycle
 * hooks below. It is instantiated once by {@link DatapackFactory} when its
 * containing module tree is enabled (i.e. it is reachable through the root
 * module's `imports`). A module NOT reachable through `imports` is never
 * constructed and emits nothing - that is the compile-time disable.
 */
export interface DatapackModule {
  /**
   * Arbitrary one-off setup: declare extra objectives, create standalone
   * functions, register structures, etc. Runs once at build time.
   */
  register?(dp: Datapack): void;

  /**
   * Appended to the shared `load` function (runs on pack load / `/reload`).
   * Always runs - load-time setup is not gated by the runtime flag.
   */
  onLoad?(ctx: FunctionContext): void;

  /**
   * Appended to the shared `tick` function (runs every game tick) - but only
   * reached while every `area` ancestor of this module is active. Put per-tick
   * work here (proximity checks, timers); it costs nothing while an ancestor
   * area is inactive, because the parent's single `active` check skips the whole
   * subtree before this is ever called.
   */
  onTick?(ctx: FunctionContext): void;

  /**
   * Runs once when this module's `area` becomes active (see {@link ModuleMetadata.area}) -
   * e.g. summon a level's entities. Only meaningful on an `area` module; emitted
   * into its generated `<name>/activate` function.
   */
  onActivate?(ctx: FunctionContext): void;

  /**
   * How an `@On({ name })` handler body becomes a function - override to apply
   * whatever conventions this pack puts on every function it creates (a trace
   * line, a tag, a naming scheme). Defaults to a plain `dp.createFunction`.
   *
   * The same reasoning as a handler's detector being an argument: the framework
   * decides that a named body *gets* a function, not what one of this pack's
   * functions looks like.
   */
  defineFunction?(
    dp: Datapack,
    name: string,
    body: (ctx: FunctionContext) => void,
  ): FunctionRef;

  /**
   * Runs once when this module's `area` becomes inactive - e.g. despawn the
   * level's entities and clean up. Emitted into `<name>/deactivate`.
   */
  onDeactivate?(ctx: FunctionContext): void;
}

/** A class implementing {@link DatapackModule}, decorated with {@link Module}. */
export interface ModuleClass {
  new (): DatapackModule;
}

/**
 * A pre-instantiated, configured module - the NestJS `forRoot`/`forFeature`
 * analogue. A feature that needs per-use config (e.g. a door at a given
 * position) exposes a factory returning one of these, so the same feature can be
 * imported many times with different settings. Build one with
 * {@link defineModule}.
 */
export interface ConfiguredModule {
  readonly __configured: true;
  readonly metadata: ModuleMetadata;
  readonly instance: DatapackModule;
}

/**
 * Anything accepted in a module's `imports`: a decorated class (built with no
 * args) or a {@link ConfiguredModule} (already built with config).
 */
export type ModuleRef = ModuleClass | ConfiguredModule;

/** Build target. `dev` is the iteration build; `prod` is the shippable one. */
export type BuildEnv = "dev" | "prod";

/** Metadata attached to a class by the {@link Module} decorator. */
export interface ModuleMetadata {
  /**
   * Stable identifier for the module. Used as the scoreboard fake-player id
   * (`#<name> modules`) and as the namespace for the enable/disable functions.
   */
  name: string;

  /**
   * Child modules to compose in (NestJS-style): decorated classes and/or
   * {@link ConfiguredModule}s. Listing a module here enables it; removing it
   * disables it at compile time. References are de-duplicated by identity, so
   * the same class (or the same configured instance) imported by several
   * parents is only built once - but two separate `Door(...)` calls are two
   * distinct doors.
   */
  imports?: ModuleRef[];

  /**
   * Mark this module as an **area**: it owns an `active` scoreboard flag, and its
   * own `onTick` *and the entire subtree of modules it imports* run only while
   * that flag is `1`. An inactive area costs a single `execute if score … active`
   * check per tick - everything beneath it (including children's proximity
   * checks) is skipped. Flip it with the generated `<name>/activate` /
   * `<name>/deactivate` functions, or a {@link regionTrigger}/{@link scoreTrigger}.
   */
  area?: boolean;

  /**
   * Initial state of an `area`'s flag, set in `load`. Default `false` - areas
   * start inactive and are switched on by a trigger (a level you enter, etc.).
   * Set `true` for an area that should be live from load.
   */
  activeByDefault?: boolean;

  /**
   * How this `area` switches itself on (see {@link AreaTrigger}). Omit to
   * activate it manually via the generated `<name>/activate` function.
   */
  trigger?: AreaTrigger;

  /**
   * The dimension this `area` lives in. When set, twine runs the area's whole
   * lifecycle *in* it: `onActivate`/`onDeactivate`, the throttled `onTick`/`@On`
   * subtree, and the arm/presence detectors are each wrapped in
   * `execute in <dimension> run …`. A feature states "I live in the End" once,
   * instead of every handler re-adding `.in(...)` and one silently forgetting -
   * a positional trigger, or a block/`from block` read inside a handler, then
   * resolves against the area's dimension rather than against wherever the tick
   * loop happens to run (the overworld). Child areas inherit it, so a nested
   * area need only name a dimension when it differs from its parent's. Only
   * meaningful on an `area` module.
   */
  dimension?: Id;

  /**
   * Restrict the module to specific build environments. When set, the module
   * (and any modules reachable only through it) is compiled in only if the
   * active {@link BuildEnv} is listed - e.g. `env: ["dev"]` for debug-only
   * features that must never reach a prod build. Omit to include in all envs.
   */
  env?: BuildEnv[];

  /**
   * Throttle this module's `onTick`: run it once every `tickEvery` ticks instead
   * of every tick. Wrapped *inside* any area gating, so it still costs nothing
   * while an ancestor area is dormant - this just spreads out the work while
   * active. Omit (or `1`) to run every tick. Use for per-tick work that doesn't
   * need 20 Hz (proximity sweeps, slow timers) to cut per-tick command volume.
   */
  tickEvery?: number;

  /**
   * The offset (in ticks, `0..tickEvery-1`) at which this module's throttled
   * `onTick` fires within its period. Lets you deliberately spread same-period
   * modules across different ticks. Omit to have the factory auto-assign distinct
   * phases round-robin across modules sharing a `tickEvery`, so they don't all
   * fire on the same tick. Only meaningful with `tickEvery` set.
   */
  tickPhase?: number;
}
