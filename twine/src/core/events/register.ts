// Registers event handlers: the `@On`/`@Every` decorators and their imperative forms.
import "reflect-metadata";
import { Detect } from "helix";
import type { Detector, FunctionContext } from "helix";
import { HandlerGroup } from "./group";
import type { EventHandler, OnOptions } from "./types";

const HANDLERS = Symbol("datapack:event-handlers");

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
