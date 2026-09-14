// `ctx.setModifier(target, attribute, id, value, operation)`: sets an attribute modifier, even if it's already there.
//
//   ctx.setModifier(Selector.self(), Attribute.MOVEMENT_SPEED, Id("pack:speed"), 0.2, "add_multiplied_base");
import { FunctionContext } from "../frontend/context";
import { Selector } from "../frontend/nodes/selector";
import type { Attribute, Id } from "../values";

/** How a modifier combines with the attribute's value. */
export type ModifierOperation = "add_value" | "add_multiplied_base" | "add_multiplied_total";

declare module "../frontend/context" {
  interface FunctionContext {
    /**
     * Sets modifier `id` on `target`'s `attribute` to `value`.
     *
     * Removes it first, since `modifier add` fails when the id is already there.
     */
    setModifier(target: Selector, attribute: Attribute, id: Id, value: number, operation: ModifierOperation): void;
  }
}

FunctionContext.prototype.setModifier = function (this: FunctionContext, target, attribute, id, value, operation) {
  this.attribute().modifierRemove(target, attribute, id);
  const add = this.attribute();
  if (operation === "add_value") add.modifierAddAddValue(target, attribute, id, value);
  else if (operation === "add_multiplied_base") add.modifierAddAddMultipliedBase(target, attribute, id, value);
  else add.modifierAddAddMultipliedTotal(target, attribute, id, value);
};
