import type { ASTNode } from "../../ir/node";

/**
 * A stack of the current function context, so helpers like `Score.times` can emit without a
 * `ctx` argument.
 *
 * Safe because every builder runs its callback synchronously. Outside a builder
 * `currentContext()`
 * is `undefined`, so pass the context explicitly there.
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

/** Runs `body` with `ctx` as the current context, then restores the previous one. */
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
