// `ctx.ref(target, body)`: names an entity so it can be found again after `execute as` moves `@s`.
//
//   ctx.ref(Selector.self(), (c, mob) =>
//     c.execute().as(Selector.allPlayers()).run((b) => b.damage().by(Selector.self(), 4, DamageType.MOB_ATTACK, mob())),
//   );
import { FunctionNode } from "../ir/node";
import { FunctionContext } from "../frontend/context";
import { Selector } from "../frontend/nodes/selector";

/** A fresh tag for a ref in `fn`, numbered on its root like locals. */
export function allocRefTag(fn: FunctionNode): string {
  const root = fn.root;
  // Tags only allow `[A-Za-z0-9_.+-]`, and function names have `/`.
  return `helix.ref.${root.name.replace(/[^\w.+-]/g, ".")}.${root.refs++}`;
}

declare module "../frontend/context" {
  interface FunctionContext {
    /**
     * Runs `body` with `ref()` selecting the entities `target` matches here, from any context.
     *
     * Compiles to a tag added before `body` and removed after it, so a `return` directly in
     * `body` leaves the tag on. `ref()` keeps `target`'s `type=`, so give one to keep lookups
     * narrow. It is a new selector each call because selectors change in place.
     */
    ref(target: Selector, body: (ctx: FunctionContext, ref: () => Selector) => void): void;
  }
}

FunctionContext.prototype.ref = function (
  this: FunctionContext,
  target: Selector,
  body: (ctx: FunctionContext, ref: () => Selector) => void,
): void {
  const tag = allocRefTag(this.fn);
  const self = target.reach() === "self";
  // `@s` is one entity, and removing from `@s` avoids scanning every entity again.
  const ref = () => {
    const s = Selector.allEntities().typeOf(target).tag(tag);
    return self ? s.limit(1) : s;
  };
  this.tag().add(target, tag);
  body(this, ref);
  this.tag().remove(self ? Selector.self() : ref(), tag);
};
