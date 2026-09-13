import { CommandNodeBase, CommandPart } from "../ir/node";
import { ArgInput, toCommandValue } from "../values/value";

export const litPart = (value: string): CommandPart => ({
  kind: "literal",
  value,
});

/**
 * Builds an argument part. The value is kept typed and rendered for the target version at
 * codegen.
 */
export const argPart = (value: ArgInput): CommandPart => ({
  kind: "arg",
  value: toCommandValue(value),
});

/**
 * Base class for command builders. The node is already emitted; chained calls edit it in
 * place:
 *
 *     ctx.weather().clear(100);   // weather() emits the node; clear() fills it
 *
 * `$set(...)` replaces the parts, `$append(...)` adds to them. The `$` avoids clashing with
 * generated sub-command methods like `worldborder set`.
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
