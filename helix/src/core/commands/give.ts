import { ASTNode } from "../ir/node";
import { SelectorNode } from "./selector";
import { CodegenContext, CommandHandler } from "../ir/commandhandler";
import { validateRegistryId } from "../../versions/registry";
import { Selector } from "../frontend/nodes/selector";
import { Player } from "../frontend/nodes/player";
import { FunctionContext } from "../frontend/context";
import { Item, ItemValue } from "../values/item";
import { Enchantment } from "../values/resource.generated";

/**
 * Legacy loose description of an item to give. Superseded by the rich
 * {@link Item} builder ({@link ItemValue}), which is the single source of truth
 * for item data across give/predicate/holding - prefer
 * `Item("...").named(...).enchant(...)`. Still accepted by {@link FunctionContext.playerGive}
 * and lowered through the same `Item` machinery.
 */
export interface ItemSpec {
  id: Item | string;
  count?: number;
  customName?: string;
  customModelData?: number;
  enchantments?: Map<Enchantment, number>;
}

/** Coerce any accepted give input into the rich {@link ItemValue} single-source object. */
export function toItem(input: ItemSpec | Item | string): ItemValue {
  if (input instanceof ItemValue) return input;
  if (typeof input === "string") return Item(input);
  const item = input.id instanceof ItemValue ? input.id : Item(String(input.id));
  if (input.count !== undefined) item.count(input.count);
  if (input.customName !== undefined) item.named(input.customName);
  if (input.customModelData !== undefined) item.modelData(input.customModelData);
  if (input.enchantments) {
    for (const [ench, lvl] of input.enchantments) item.enchant(ench, lvl);
  }
  return item;
}

export class PlayerGiveNode extends ASTNode {
  type = "player_give";
  constructor(
    public target: SelectorNode,
    public item: ItemSpec | Item,
  ) {
    super();
  }
}

function resolveTarget(node: PlayerGiveNode, ctx: CodegenContext): string {
  const scratch = new CodegenContext(ctx.datapack, ctx.dispatcher);
  ctx.dispatcher.dispatch(node.target as ASTNode, scratch);
  return scratch.lines[0];
}

export class PlayerGiveCommand extends CommandHandler<PlayerGiveNode> {
  readonly type: PlayerGiveNode["type"] = "player_give";

  generate(node: PlayerGiveNode, ctx: CodegenContext): void {
    const item = toItem(node.item);
    const id = validateRegistryId(
      ctx.version,
      ctx.version.registries.items,
      "item",
      item.baseId(),
    );
    const target = resolveTarget(node, ctx);
    const data = item.renderData(ctx.version);
    ctx.emit(`give ${target} ${id}${data} ${item.getCount() ?? 1}`);
  }
}

declare module "../frontend/context" {
  interface FunctionContext {
    /** `give <target> <item> [count]` - accepts a rich `Item`, a bare id string, or a legacy `ItemSpec`. */
    playerGive(selector: Selector, item: ItemSpec | Item | string, count?: number): void;
    /** A named player as a selector helper: `ctx.player("Steve").giveItem(...)`. */
    player(name: string): Player;
  }
}

FunctionContext.prototype.playerGive = function (
  this: FunctionContext,
  selector: Selector,
  item: ItemSpec | Item | string,
  count?: number,
) {
  // Normalize to the single-source Item. An explicit `count` arg wins; otherwise
  // the item/spec keeps whatever count it already carries (default 1 at render).
  const resolved = toItem(item);
  if (count !== undefined) resolved.count(count);
  this.emit(new PlayerGiveNode(selector.build(), resolved));
};

FunctionContext.prototype.player = function (this: FunctionContext, name: string) {
  return new Player(this.fn, name);
};
