import "reflect-metadata";
import { Detect, Range, ScoreTarget } from "helix";
import type { Datapack, Detector, FunctionContext, Score } from "helix";

/**
 * Method-level event handlers: `@On(detector)` marks a method as the body that
 * runs when a condition becomes true.
 *
 * Vanilla has no general "when this changes" hook, so almost every event in a
 * datapack is really a **poll plus a latch**: test the condition every N ticks,
 * and remember that it fired so the body runs once per occurrence rather than
 * once per tick. Written by hand that comes out as three separate things - a
 * polling function, a flag, and a reward function reached by name - none of which
 * is the gameplay. `@On` makes the poll and the latch the framework's problem so
 * the method body, the only interesting part, is the only part you write.
 *
 * The condition itself stays yours: a {@link Detector} is an ordinary function
 * (see helix's `Detect`), so the cost of detection is an argument, not something
 * the framework picks for you. See {@link OnOptions.every} and `Detect.near`.
 */

const HANDLERS = Symbol("datapack:event-handlers");

/** How a handler is polled. Every field has a default worth leaving alone. */
export interface OnOptions {
  /**
   * Fire once per arming, not once per tick the condition holds. Default `true`.
   *
   * A latched handler consumes itself: the flag is set before the body runs, and
   * stays set until {@link rearmEvents} clears it. Set `false` for a body that is
   * *meant* to repeat while the condition is true (an ambience loop, a damage
   * tick) - then no flag is allocated and no `unless score` guard is emitted.
   */
  once?: boolean;

  /**
   * Test the detector once every `every` ticks instead of every tick.
   *
   * **This is the cost dial.** A handler's per-tick price is its detector, paid
   * at this rate, whenever its module's area is active - so a button nobody can
   * reach in under half a second has no business being read 20 times a second.
   * Defaults to the module's own `tickEvery`, so a module that already declared
   * a cadence doesn't restate it per handler.
   */
  every?: number;

  /** Offset within the `every` period, to spread same-period handlers apart. */
  phase?: number;

  /**
   * Emit the body into its own `<name>.mcfunction` and call it, instead of
   * inlining it under the guard. Worth it for a body long enough to want a name
   * in `/function` and in a stack trace; leave it off for a one-liner.
   */
  name?: string;
}

/** One registered handler: the metadata `@On` attached, plus the method it marked. */
export interface EventHandler {
  /**
   * The handler's stable key: the latch id and the name {@link rearmEvents}
   * matches on. For a decorator handler this is the marked method's name; for an
   * {@link addEventHandler imperatively registered} one it's a caller-chosen key,
   * unique within the module, and {@link fn} carries the body instead.
   */
  readonly method: string;
  readonly detector: Detector;
  readonly opts: OnOptions;
  /**
   * The body, when the handler was registered imperatively rather than by
   * decorating a method. When set, {@link method} is only a key - no method of
   * that name need exist on the instance.
   */
  readonly fn?: (c: FunctionContext) => void;
}

/**
 * Run the decorated method when `detector` holds.
 *
 * ```ts
 * @Module({ name: "stage1", area: true, tickEvery: 10 })
 * export class Stage1Module {
 *   @On(Detect.in(THE_END, Detect.block(BUTTON_POS, PRESSED)), { name: "stage1/water" })
 *   waterButton(ctx: FunctionContext) {
 *     ctx.execute().in(THE_END).run((c) => c.setblock(GAP, Block.AIR));
 *   }
 * }
 * ```
 *
 * The method is called **once, at build time**, with the context its guard
 * narrowed to - like every other twine lifecycle hook. It emits commands; it does
 * not run per tick.
 *
 * The decorator harvests off the constructor's metadata, so a handler must be a
 * method on a class in the module's prototype chain. When the body lives on a
 * *different* object - a plain helper the module composes rather than inherits -
 * register it imperatively instead with {@link on} / {@link every} (or
 * {@link addEventHandler}), which attach the handler to the module instance and
 * so need no method on its prototype.
 */
export function On(detector: Detector, opts: OnOptions = {}): MethodDecorator {
  return (target, key) => {
    const owner = target.constructor;
    // Own-property, not inherited: a subclass that adds handlers must not
    // retroactively give its base class's other subclasses the same ones.
    const existing: EventHandler[] = Reflect.getOwnMetadata(HANDLERS, owner) ?? [
      ...(Reflect.getMetadata(HANDLERS, owner) ?? []),
    ];
    existing.push({ method: String(key), detector, opts });
    Reflect.defineMetadata(HANDLERS, existing, owner);
  };
}

/**
 * Run the decorated method every `ticks` ticks, unconditionally - `@On` with no
 * condition and no latch.
 *
 * The degenerate event, and common enough to deserve its own name: ambience,
 * particle emitters, slow sweeps. It still lives in the module's tick tree, so it
 * costs nothing while an ancestor area is dormant, and it no longer needs a module
 * of its own just to carry a `tickEvery`.
 */
export function Every(ticks: number, opts: Omit<OnOptions, "once" | "every"> = {}): MethodDecorator {
  return On(Detect.always(), { ...opts, once: false, every: ticks });
}

/**
 * Per-instance handler store for {@link addEventHandler}. An own symbol property
 * on the instance, kept separate from the constructor's decorator metadata so
 * the two paths never alias and {@link getEventHandlers} can merge them.
 */
const INSTANCE_HANDLERS = Symbol("datapack:instance-event-handlers");

/**
 * Register a handler on `instance` directly, without a decorated method.
 *
 * The counterpart to {@link On} for handlers whose body lives on a helper the
 * module composes rather than a method it inherits: pass a {@link EventHandler.fn}
 * body and a `method` key unique within the module. Prefer {@link on} /
 * {@link every}, which fill this in.
 *
 * The key must be unique among the instance's imperative handlers - it names the
 * latch and is what {@link rearmEvents} matches on - so a collision is a build
 * error, standing in for the compile-time guarantee a shared prototype's distinct
 * method names used to give.
 */
export function addEventHandler(instance: object, handler: EventHandler): void {
  const store = instance as { [INSTANCE_HANDLERS]?: EventHandler[] };
  const list = (store[INSTANCE_HANDLERS] ??= []);
  if (list.some((h) => h.method === handler.method)) {
    throw new Error(`duplicate event handler key "${handler.method}"`);
  }
  list.push(handler);
}

/**
 * Imperative {@link On}: register `fn` to run when `detector` holds, keyed by
 * `key`. See {@link addEventHandler}.
 */
export function on(
  instance: object,
  key: string,
  detector: Detector,
  fn: (c: FunctionContext) => void,
  opts: OnOptions = {},
): void {
  addEventHandler(instance, { method: key, detector, opts, fn });
}

/** Imperative {@link Every}: run `fn` every `ticks` ticks, keyed by `key`. */
export function every(
  instance: object,
  key: string,
  ticks: number,
  fn: (c: FunctionContext) => void,
  opts: Omit<OnOptions, "once" | "every"> = {},
): void {
  on(instance, key, Detect.always(), fn, { ...opts, once: false, every: ticks });
}

/**
 * Every handler on `instance`: those its class declared via {@link On}/
 * {@link Every}, those {@link addEventHandler} registered on the instance
 * itself, then - for each {@link HandlerGroup} the instance holds, in field
 * order - that group's handlers, namespaced under the group's
 * {@link HandlerGroup.ns}. Groups are discovered by type, so a module composes a
 * group just by holding it; no marker is needed.
 *
 * A field holding an **array** of groups counts too, and is the form to prefer
 * when order matters: field order here is *property definition* order, which
 * under `useDefineForClassFields` is the order the fields are **declared**, not
 * the order the constructor assigns them - so a class with one field per group
 * fires them in an order that isn't visible where the groups are built. One
 * `groups = [new A(...), new B(...)]` field puts the order in the array literal,
 * and needs no definite-assignment assertions.
 */
export function getEventHandlers(instance: object): EventHandler[] {
  const groups = Object.values(instance)
    .flatMap((v) => (Array.isArray(v) ? (v as unknown[]) : [v]))
    .filter((v): v is HandlerGroup => v instanceof HandlerGroup);
  return [...getOwnEventHandlers(instance), ...groups.flatMap((g) => g.collect())];
}

/** Handlers declared on `instance`'s own class, or registered on it directly. */
function getOwnEventHandlers(instance: object): EventHandler[] {
  const decorated = (Reflect.getMetadata(HANDLERS, instance.constructor) as EventHandler[]) ?? [];
  const imperative = (instance as { [INSTANCE_HANDLERS]?: EventHandler[] })[INSTANCE_HANDLERS] ?? [];
  return [...decorated, ...imperative];
}

/** Scoreboard objective holding every `once` handler's already-fired flag. */
export const EVENT_OBJECTIVE = "events";

/**
 * Owns the latch flags for `once` handlers - one fake-player score per handler,
 * named `#<module>.<method>`.
 *
 * Separate from `ActiveFlags`' objective on purpose: area flags are read by the
 * tick tree on every tick and are worth keeping to a small, scannable set, while
 * these are per-handler bookkeeping that can run to dozens.
 */
export class EventLatches {
  private readonly objective;

  constructor(dp: Datapack) {
    this.objective = dp.objective(EVENT_OBJECTIVE);
  }

  /** The already-fired flag for one handler. */
  score(moduleName: string, method: string): Score {
    return this.objective.score(ScoreTarget(`#${moduleName}.${method}`));
  }
}

/** `matches 1` - the "already fired" test, hoisted so both sites agree. */
const FIRED = new Range(1, 1);

/**
 * Emit one handler into `ctx`: the latch guard, then the detector's clauses, then
 * the flag write and the body.
 *
 * The latch is a clause on the **same** chain as the detector rather than a chain
 * wrapping it, so the whole test is one `execute` and - crucially - the cheap
 * scoreboard read comes first: a spent handler costs a score comparison, never
 * the detector it guards.
 *
 * The flag is set inside that narrowed context and *before* the body, so a body
 * that changes the condition it fired on (a button press that replaces the
 * button) can't re-trigger itself.
 */
export function emitHandler(
  ctx: FunctionContext,
  handler: EventHandler,
  latch: Score | undefined,
  body: (c: FunctionContext) => void,
): void {
  const chain = ctx.execute();
  if (latch) chain.unlessScoreMatches(latch, FIRED);
  handler.detector(chain);
  chain.runOrInline((c) => {
    latch?.set(1, c);
    body(c);
  });
}

/**
 * Re-arm `once` handlers on `module`, so they can fire again - clearing the flags
 * {@link On} set.
 *
 * Nothing re-arms itself: a latched event stays spent until something in the pack
 * decides the world has changed enough to warrant another (for a puzzle room,
 * that's the room being rebuilt). Name methods to re-arm only those, or omit
 * `methods` for all of them.
 */
export function rearmEvents(
  ctx: FunctionContext,
  dp: Datapack,
  moduleName: string,
  instance: object,
  methods?: readonly string[],
): void {
  const latches = new EventLatches(dp);
  for (const h of getEventHandlers(instance)) {
    if (h.opts.once === false) continue;
    if (methods && !methods.includes(h.method)) continue;
    latches.score(moduleName, h.method).set(0, ctx);
  }
}

/**
 * A group of event handlers living on a helper object the module composes, rather
 * than as decorated methods on the module's own class.
 *
 * The module discovers its groups **by type**: any field that is a `HandlerGroup`
 * instance is picked up by {@link getEventHandlers}, its {@link registerHandlers}
 * run once, and its handlers merged into the module's tick tree - each namespaced
 * by {@link ns}, so keys stay unique across groups without the shared prototype a
 * mixin would force. The group needs no reference to the module and the module
 * needs no marker: it just constructs the group as a field. The framework owns the
 * registration mechanism (where handlers attach, when they're collected, how keys
 * are namespaced and re-armed); the group owns only the declarations.
 */
export abstract class HandlerGroup {
  /** This group's namespace: every key and named function is prefixed `${ns}/`. */
  abstract readonly ns: string;

  /**
   * Declare this group's handlers with {@link on}/{@link every}. Called once, by
   * the framework, the first time the group is harvested or re-armed - never call
   * it yourself. It runs after the subclass constructor, so it may read fields the
   * constructor set.
   */
  abstract registerHandlers(): void;

  private readonly handlers: EventHandler[] = [];
  private registered = false;

  private ensureRegistered(): void {
    if (this.registered) return;
    this.registered = true;
    this.registerHandlers();
  }

  /** Register a handler keyed by `key` (bare - {@link ns} is prepended on harvest). */
  protected on(
    key: string,
    detector: Detector,
    fn: (c: FunctionContext) => void,
    opts: OnOptions = {},
  ): void {
    if (this.handlers.some((h) => h.method === key)) {
      throw new Error(`duplicate handler key "${key}" in group "${this.ns}"`);
    }
    this.handlers.push({ method: key, detector, opts, fn });
  }

  /** {@link Every} as a group method: run `fn` every `ticks` ticks, keyed by `key`. */
  protected every(
    key: string,
    ticks: number,
    fn: (c: FunctionContext) => void,
    opts: Omit<OnOptions, "once" | "every"> = {},
  ): void {
    this.on(key, Detect.always(), fn, { ...opts, once: false, every: ticks });
  }

  /**
   * Re-arm this group's own latched handlers - the {@link rearmEvents} a group
   * runs on itself. Clears `#${moduleName}.${ns}/${key}` for each latched handler
   * whose bare key is in `keys` (all latched handlers if `keys` is omitted).
   */
  protected rearm(
    ctx: FunctionContext,
    dp: Datapack,
    moduleName: string,
    keys?: readonly string[],
  ): void {
    this.ensureRegistered();
    const latches = new EventLatches(dp);
    for (const h of this.handlers) {
      if (h.opts.once === false) continue;
      if (keys && !keys.includes(h.method)) continue;
      latches.score(moduleName, `${this.ns}/${h.method}`).set(0, ctx);
    }
  }

  /**
   * This group's handlers, namespaced under {@link ns} - the module-side view
   * {@link getEventHandlers} merges into the tick tree. Runs
   * {@link registerHandlers} on first use.
   */
  collect(): EventHandler[] {
    this.ensureRegistered();
    return this.handlers.map((h) => ({
      method: `${this.ns}/${h.method}`,
      detector: h.detector,
      opts: h.opts.name ? { ...h.opts, name: `${this.ns}/${h.opts.name}` } : h.opts,
      fn: h.fn,
    }));
  }
}
