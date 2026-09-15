// The options and shape of one event handler, and how its registration arguments are read.
import type { Detector, FunctionContext } from "helix";

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

  /** Put the body in its own function instead of inlining it. Useful for long bodies. */
  own?: boolean;
}

/** One registered handler: the metadata `@On` attached, plus the method it marked. */
export interface EventHandler {
  /**
   * The handler's key: its latch id and what {@link rearmEvents} matches.
   * The method name for decorated handlers, or a caller-chosen key when {@link fn} is set. Only
   * latched handlers need one.
   */
  readonly method?: string;
  /** The folder an `own` body goes in. Defaults to the module's name. */
  readonly group?: string;
  readonly detector: Detector;
  readonly opts: OnOptions;
  /** The body, for handlers registered without a decorated method. */
  readonly fn?: (c: FunctionContext) => void;
}

/** The arguments of {@link on} after the instance, keyed or not. */
export type HandlerArgs =
  | [string, Detector, (c: FunctionContext) => void, OnOptions?]
  | [Detector, (c: FunctionContext) => void, OnOptions & { once: false }];

/** Builds a handler from {@link HandlerArgs}. */
export function handlerOf(args: HandlerArgs): EventHandler {
  if (typeof args[0] === "string") {
    const [method, detector, fn, opts = {}] = args as [
      string,
      Detector,
      (c: FunctionContext) => void,
      OnOptions?,
    ];
    return { method, detector, opts, fn };
  }
  const [detector, fn, opts] = args as [
    Detector,
    (c: FunctionContext) => void,
    OnOptions,
  ];
  return { detector, opts, fn };
}
