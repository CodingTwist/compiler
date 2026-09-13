import "reflect-metadata";
import { Detect, Range, ScoreTarget } from "helix";
import type { Datapack, Detector, FunctionContext, Score } from "helix";

/**
 * `@On(detector)` runs a method when a condition becomes true.
 *
 * Datapack events are really a poll plus a latch. `@On` writes both, so you only write the body.
 * The detector is yours, so you choose what detection costs.
 */

const HANDLERS = Symbol("datapack:event-handlers");

/** How a handler is polled. */
export interface OnOptions {
  /**
   * Fire once per arming instead of every tick the condition holds. Default `true`.
   *
   * The latch stays set until {@link rearmEvents}. Set `false` for bodies meant to repeat.
   */
  once?: boolean;

  /**
   * Check the detector every `every` ticks. Defaults to the module's `tickEvery`.
   *
   * This is the main cost setting: the detector runs at this rate while the module's area is
   * active.
   */
  every?: number;

  /** Offset within the `every` period, to spread same-period handlers apart. */
  phase?: number;

  /**
   * Put the body in its own `<name>.mcfunction` instead of inlining it. Useful for long bodies.
   */
  name?: string;
}

/** One registered handler: the metadata `@On` attached, plus the method it marked. */
export interface EventHandler {
  /**
   * The handler's key: its latch id and what {@link rearmEvents} matches.
   * The method name for decorated handlers, or a caller-chosen key when {@link fn} is set.
   */
  readonly method: string;
  readonly detector: Detector;
  readonly opts: OnOptions;
  /** The body, for handlers registered without a decorated method. */
  readonly fn?: (c: FunctionContext) => void;
}

/**
 * Runs the decorated method when `detector` holds.
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
 * The method runs once at build time and emits commands, like other lifecycle hooks. For bodies on
 * a helper object rather than the module class, use {@link on} / {@link every}.
 */
export function On(detector: Detector, opts: OnOptions = {}): MethodDecorator {
  return (target, key) => {
    const owner = target.constructor;
    // Own metadata only, so a subclass's handlers don't leak to its siblings.
    const existing: EventHandler[] = Reflect.getOwnMetadata(HANDLERS, owner) ?? [
      ...(Reflect.getMetadata(HANDLERS, owner) ?? []),
    ];
    existing.push({ method: String(key), detector, opts });
    Reflect.defineMetadata(HANDLERS, existing, owner);
  };
}

/**
 * Runs the decorated method every `ticks` ticks, with no condition or latch.
 *
 * Still gated by the module's area, so it costs nothing while dormant.
 */
export function Every(ticks: number, opts: Omit<OnOptions, "once" | "every"> = {}): MethodDecorator {
  return On(Detect.always(), { ...opts, once: false, every: ticks });
}

/**
 * Per-instance handlers from {@link addEventHandler}, kept apart from decorator metadata.
 */
const INSTANCE_HANDLERS = Symbol("datapack:instance-event-handlers");

/**
 * Registers a handler on `instance` without a decorated method.
 *
 * Prefer {@link on} / {@link every}. The key must be unique in the module, since it names the
 * latch; a duplicate throws.
 */
export function addEventHandler(instance: object, handler: EventHandler): void {
  const store = instance as { [INSTANCE_HANDLERS]?: EventHandler[] };
  const list = (store[INSTANCE_HANDLERS] ??= []);
  if (list.some((h) => h.method === handler.method)) {
    throw new Error(`duplicate event handler key "${handler.method}"`);
  }
  list.push(handler);
}

/** Imperative {@link On}: runs `fn` when `detector` holds. See {@link addEventHandler}. */
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
 * Every handler on `instance`: decorated, imperatively added, then those of each
 * {@link HandlerGroup} field, namespaced by {@link HandlerGroup.ns}.
 *
 * Group fields run in declaration order. Put groups in one array field if order matters, so
 * the order is visible where they're built.
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
 * Latch flags for `once` handlers: one `#<module>.<method>` score each.
 *
 * A separate objective from `ActiveFlags`, which the tick reads every tick and should stay small.
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
const FIRED = Range.exactly(1);

/**
 * Emits one handler: latch check, detector, flag set, then the body.
 *
 * The latch check goes first on the same `execute`, so a spent handler only costs a score check.
 * The flag is set before the body so a body that changes its own condition can't re-trigger.
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
    latch?.set(1);
    body(c);
  });
}

/**
 * Re-arms `once` handlers on `module` so they can fire again. Omit `methods` for all of them.
 *
 * Nothing re-arms by itself; the pack decides when (e.g. when a puzzle room is rebuilt).
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
    latches.score(moduleName, h.method).set(0);
  }
}

/**
 * A set of event handlers on a helper object the module holds as a field.
 *
 * The module finds groups by type, runs their {@link registerHandlers} once, and namespaces their
 * keys by {@link ns}. The group needs no reference to the module.
 */
export abstract class HandlerGroup {
  /** This group's namespace: every key and named function is prefixed `${ns}/`. */
  abstract readonly ns: string;

  /**
   * Declares this group's handlers with {@link on}/{@link every}. Called once by the framework.
   *
   * Runs after the subclass constructor, so fields are set.
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

  /** Re-arms this group's latched handlers in `keys`, or all of them if omitted. */
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
      latches.score(moduleName, `${this.ns}/${h.method}`).set(0);
    }
  }

  /** This group's handlers, namespaced under {@link ns}. Registers them on first use. */
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
