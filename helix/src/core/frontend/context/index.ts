import { ContextBase } from "./base";

/**
 * The author-facing context. It is just the shared plumbing (`ContextBase`):
 * emit/call/version/child functions. EVERY `ctx.<command>()` method - sugar
 * (`say`, `tellraw`, score ops, `if`, `give`, …) and vanilla (`weather`,
 * `effect`, …) alike - is a `FunctionContext.prototype` augmentation that lives
 * WITH its command in `src/core/commands/<cmd>.ts` (interface + prototype).
 * Importing `src/core/commands` (done by the frontend barrel) installs them all,
 * so each command is fully self-contained and the public API stays
 * `ctx.<command>(...)`.
 */
export class FunctionContext extends ContextBase {}
