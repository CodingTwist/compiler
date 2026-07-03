import { CommandNodeBase, CommandPart } from "../ir/node";
import { ArgInput, toCommandValue } from "../values/value";

export const litPart = (value: string): CommandPart => ({
  kind: "literal",
  value,
});

/**
 * Build an argument part from any accepted value. The concept (or raw
 * primitive) is kept as a `CommandValue` and rendered at codegen with the
 * target version - never stringified here.
 */
export const argPart = (value: ArgInput): CommandPart => ({
  kind: "arg",
  value: toCommandValue(value),
});

/**
 * Base for a command's fluent builder. The builder wraps the command's node
 * (already emitted into the function), so each chained call mutates that node
 * by reference - no terminal call needed:
 *
 *     ctx.weather().clear(100);   // weather() emits the node; clear() fills it
 *
 * `$set(...)` replaces the node's parts (a builder method picks one syntax);
 * `$append(...)` adds to them. The `$` prefix keeps these from colliding with
 * generated sub-command methods (e.g. `worldborder set`, `time add`).
 */
export abstract class CommandBuilder<N extends CommandNodeBase> {
  constructor(protected node: N) {}

  protected $set(...parts: CommandPart[]): this {
    this.node.parts = parts;
    return this;
  }

  protected $append(...parts: CommandPart[]): this {
    this.node.parts.push(...parts);
    return this;
  }
}
