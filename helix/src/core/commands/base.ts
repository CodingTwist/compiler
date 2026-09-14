import { CommandNodeBase, CommandPart } from "../ir/node";
import { ArgInput, toCommandValue } from "../values/value";

export const litPart = (value: string): CommandPart => ({
  kind: "literal",
  value,
});

/**
 * Returns `target`, throwing if it can pick more than one entity.
 *
 * For arguments that take one entity: vanilla rejects the whole function over one bad line.
 */
export function single<T extends { build(): { picksOne(): boolean } }>(target: T, command: string): T {
  if (!target.build().picksOne()) {
    throw new Error(`\`${command}\` takes one entity, but got \`${target}\`. Loop with execute().as(...) and pass Selector.self(), or add .limit(1).`);
  }
  return target;
}

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
