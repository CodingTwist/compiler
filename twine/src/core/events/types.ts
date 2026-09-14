// The options and shape of one event handler.
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
