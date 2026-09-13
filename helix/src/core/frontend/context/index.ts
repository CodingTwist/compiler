import { ContextBase } from "./base";

/**
 * The author-facing context. Every `ctx.<command>()` is added by its own file in
 * `src/core/commands/`.
 */
export class FunctionContext extends ContextBase {}
