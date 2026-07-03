import { FunctionNode } from "../../ir/node";
import { PlayerGiveNode } from "../../commands/give";
import { Selector } from "./selector";
import { Item } from "../../values/item";

export class Player extends Selector {
  constructor(
    private fn: FunctionNode,
    public playerName: string,
  ) {
    super(playerName);
  }

  get selector(): string {
    return `@a[name=${this.name}]`;
  }

  giveItem(item: Item, count = 1) {
    this.fn.push(new PlayerGiveNode(this.build(), { id: item, count }));
  }
}
