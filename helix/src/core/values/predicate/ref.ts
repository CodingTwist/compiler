import type { CommandValue } from "../value";

/**
 * A handle to a registered predicate that renders as its id. Created by {@link
 * Datapack.predicate}.
 */
export class PredicateRef implements CommandValue {
  constructor(readonly id: string) {}
  render(): string {
    return this.id;
  }
}
