import type { ASTNode } from "../../ir/node";

/**
 * The ambient "current function context" stack.
 *
 * Every builder that hands you a context (`FunctionRef.build`, `execute().run`,
 * `returnRun`, `if`/`elif`/`else`, `Selector.run`) invokes its callback
 * *synchronously*. That lets fluent value helpers (e.g. `Score.times`) find the
 * context they should emit into without it being threaded through every call -
 * the active context is whichever one is on top of this stack for the duration
 * of the running callback. Push on entry, pop on exit (via `runInContext`).
 *
 * This is deliberately the *only* hidden state in the frontend: it is safe
 * precisely because the builders are synchronous, so the stack top always
 * matches the callback currently executing. A helper that wants to emit outside
 * any builder must still pass its context explicitly - `currentContext()` is
 * `undefined` there.
 */

/** The minimal surface the ambient stack exposes: enough to emit a node. */
export interface EmitContext {
  emit(node: ASTNode): void;
}

const stack: EmitContext[] = [];

/** The innermost active context, or `undefined` if not inside a builder. */
export function currentContext(): EmitContext | undefined {
  return stack[stack.length - 1];
}

/**
 * Run `body` with `ctx` as the active ambient context for its synchronous
 * duration, then restore the previous one. The callback still receives `ctx`
 * explicitly, so nothing forces helpers to rely on the ambient stack.
 */
export function runInContext<T extends EmitContext>(
  ctx: T,
  body: (ctx: T) => void,
): void {
  stack.push(ctx);
  try {
    body(ctx);
  } finally {
    stack.pop();
  }
}
