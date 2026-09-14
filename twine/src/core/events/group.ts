// A set of event handlers on a helper object a module holds as a field.
import { Detect } from "helix";
import type { Datapack, Detector, FunctionContext } from "helix";
import { EventLatches } from "./latches";
import type { EventHandler, OnOptions } from "./types";

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
