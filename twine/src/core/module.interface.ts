import type { Datapack, FunctionRef, Id } from "helix";
import type { FunctionContext } from "helix";
import type { AreaTrigger } from "./area";

export type { AreaTrigger, Vec3, Zone } from "./area";

/**
 * What a module knows about itself in {@link DatapackModule.register}.
 *
 * Functions the module creates itself don't get its dimension automatically. A block check in the
 * wrong dimension silently never matches, so create them with {@link fn}.
 */
export interface ModuleScope {
  /** This module's `name` from its {@link ModuleMetadata}. */
  readonly name: string;

  /** This module's dimension: its own, the nearest ancestor's, or `undefined`. */
  readonly dimension?: Id;

  /**
   * Creates a function in this module's group whose body runs in {@link dimension}. Private
   * unless `opts.public`.
   *
   * Use it for functions called from outside the tick tree: admin commands, schedules, rewards.
   */
  fn(
    name: string,
    body: (ctx: FunctionContext) => void,
    opts?: { public?: boolean },
  ): FunctionRef;
}

/**
 * A datapack module: a class with optional lifecycle hooks.
 *
 * Built once if reachable through the root's `imports`. Unreachable modules emit nothing.
 */
export interface DatapackModule {
  /**
   * One-off build-time setup: objectives, functions, structures.
   *
   * `dp` is this module's group (`dp.root.group(name)`), so functions it creates go under the
   * module's name.
   *
   * `scope` has the module's dimension; see {@link ModuleScope}.
   */
  register?(dp: Datapack, scope: ModuleScope): void;

  /** Added to the shared `load` function. Always runs; not gated by area flags. */
  onLoad?(ctx: FunctionContext): void;

  /** Added to the shared tick, but only runs while every `area` ancestor is active. */
  onTick?(ctx: FunctionContext): void;

  /**
   * Runs once when this module's area becomes active, e.g. to summon its entities.
   * Emitted into `<name>/activate`.
   */
  onActivate?(ctx: FunctionContext): void;

  /**
   * Creates the function `name` in `group` for an `@On({ own: true })` body. Override to apply your
   * pack's function conventions. Defaults to `group.createFunction(name)`.
   */
  defineFunction?(
    group: Datapack,
    name: string,
    body: (ctx: FunctionContext) => void,
  ): FunctionRef;

  /**
   * Runs once when this module's area becomes inactive, e.g. to clean up. Emitted into
   * `<name>/deactivate`.
   */
  onDeactivate?(ctx: FunctionContext): void;
}

/** A class implementing {@link DatapackModule}, decorated with {@link Module}. */
export interface ModuleClass {
  new (): DatapackModule;
}

/**
 * A module built with config, like NestJS `forFeature`, so a feature can be imported many
 * times with different settings. Build one with {@link defineModule}.
 */
export interface ConfiguredModule {
  readonly __configured: true;
  readonly metadata: ModuleMetadata;
  readonly instance: DatapackModule;
}

/** Anything allowed in `imports`: a decorated class or a {@link ConfiguredModule}. */
export type ModuleRef = ModuleClass | ConfiguredModule;

/** Build target: `dev` for iterating, `prod` to ship. */
export type BuildEnv = "dev" | "prod";

/** Metadata attached to a class by the {@link Module} decorator. */
export interface ModuleMetadata {
  /** Stable module id. Used as the scoreboard name and the namespace for its functions. */
  name: string;

  /**
   * Child modules to include. Removing one leaves it out of the build.
   *
   * Deduplicated by identity: a shared class is built once, but two `Door(...)` calls are two
   * doors.
   */
  imports?: ModuleRef[];

  /**
   * Makes this module an area: its tick and whole import subtree only run while its `active` flag
   * is `1`.
   *
   * A dormant area costs one check per tick. Flip it with `<name>/activate` / `<name>/deactivate`
   * or a {@link trigger}.
   */
  area?: boolean;

  /** Initial flag value, set on load. Default `false`. */
  activeByDefault?: boolean;

  /**
   * How this area switches itself on (see {@link AreaTrigger}). Omit to activate manually.
   */
  trigger?: AreaTrigger;

  /**
   * The dimension this area lives in. Its lifecycle, ticks and triggers all run in it.
   *
   * Saves adding `.in(...)` to every handler, where one missed call silently checks the wrong
   * dimension. Child areas inherit it.
   */
  dimension?: Id;

  /** Build environments this module is included in, e.g. `["dev"]`. Omit for all. */
  env?: BuildEnv[];

  /**
   * Runs this module's `onTick` every `tickEvery` ticks instead of every tick. Still inside area
   * gating.
   */
  tickEvery?: number;

  /**
   * Tick offset (`0..tickEvery-1`) for the throttled `onTick`. Omit to have modules sharing a
   * `tickEvery` spread across ticks automatically.
   */
  tickPhase?: number;
}
