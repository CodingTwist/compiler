// HAND-WRITTEN. A per-slot item guard:
//   execute (if|unless) items entity <target> <slot> <item_predicate> run <command>
// The only vanilla way to test a *specific* inventory slot's contents (equipment
// predicates cover just the 6 worn slots; container/hotbar slots aren't matchable
// by a loot predicate). Lets an author loop a player's slots and act on the ones
// holding a given item - e.g. swap one custom item to another in place, in every
// slot it occupies, without disturbing the rest of the inventory. Registered via
// EXTRA_HANDLERS in scripts/gen-commands.mjs, never regenerated.
import { generateSingleNode } from "../ir/generate";
import { ASTNode, FunctionNode } from "../ir/node";
import { CodegenContext, CommandHandler } from "../ir/commandhandler";
import { arg, buildTokens, lit, raw } from "../ir/command-builder";
import { FunctionContext } from "../frontend/context";
import { Selector } from "../frontend/nodes/selector";
import { ItemValue } from "../values/item";
import { ItemSlot } from "../values/enums";
import { toCommandValue } from "../values/value";
import { VersionProfile } from "../../versions/profile";

export class ItemsGuardNode extends ASTNode {
  type = "items_guard" as const;
  constructor(
    public readonly mode: "if" | "unless",
    /** The entity whose inventory is inspected (usually `@s` under an `as`). */
    public readonly target: Selector,
    /** The single slot (or slot range) to test, e.g. `hotbar.0`, `weapon.offhand`. */
    public readonly slot: ItemSlot,
    /** The item to match - rendered as an `item_predicate` (id + components). */
    public readonly item: ItemValue,
    public readonly command: ASTNode,
  ) {
    super();
  }
}

export class ItemsGuardHandler extends CommandHandler<ItemsGuardNode> {
  readonly type: ItemsGuardNode["type"] = "items_guard";

  generate(node: ItemsGuardNode, ctx: CodegenContext): void {
    const command = generateSingleNode(node.command, ctx.datapack, ctx.dispatcher);
    ctx.emit(
      buildTokens(ctx.version, [
        lit("execute"),
        lit(node.mode),
        lit("items"),
        lit("entity"),
        arg(toCommandValue(node.target).render(ctx.version)),
        arg(node.slot),
        arg(node.item.render(ctx.version)),
        raw(`run ${command}`),
      ]),
    );
  }
}

declare module "../frontend/context" {
  interface FunctionContext {
    /**
     * Run each command emitted in `build` only when `target`'s `slot` holds an
     * item matching `item` - one `execute (if|unless) items entity <target>
     * <slot> <item_predicate> run <command>` line per emitted command (`mode`
     * defaults to `"if"`). `item` is matched as an item predicate built from the
     * same {@link ItemValue} you'd `give`, so the check sees the exact components
     * (name/lore/model) the item was granted with. Use this to act on a precise
     * slot when an equipment/`holding` predicate (worn slots only) can't reach it.
     */
    whenItems(
      target: Selector,
      slot: ItemSlot,
      item: ItemValue,
      build: (ctx: FunctionContext) => void,
      mode?: "if" | "unless",
    ): void;
  }
}

FunctionContext.prototype.whenItems = function (
  this: FunctionContext,
  target: Selector,
  slot: ItemSlot,
  item: ItemValue,
  build: (ctx: FunctionContext) => void,
  mode: "if" | "unless" = "if",
): void {
  // Capture the builder's commands into a throwaway function, then re-emit each
  // wrapped in the items guard (one line per command). Mirrors whenEntity.
  const tmp = new FunctionNode(this.fn.name);
  const child = new (this.constructor as new (
    fn: FunctionNode,
    v: VersionProfile,
  ) => FunctionContext)(tmp, this.version);
  build(child);
  for (const inner of tmp.nodes) {
    this.emit(new ItemsGuardNode(mode, target, slot, item, inner));
  }
};
