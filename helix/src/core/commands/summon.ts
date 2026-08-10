// HAND-REFINED (listed in gen-commands.mjs's HAND_REFINED so it survives a regen):
// generated shape plus the raw-NBT warning below.
import { CommandPart, TreeCommandNode } from "../ir/node";
import { FunctionContext } from "../frontend/context";
import { CommandBuilder, litPart, argPart } from "./base";
import { EntityType, Nbt, Pos, warnRawEntityNbt } from "../values";

/** `summon` */
export class SummonBuilder extends CommandBuilder<TreeCommandNode> {

}

declare module "../frontend/context" {
  interface FunctionContext {
    /** `summon` - `ctx.summon()...` */
    summon(entity: EntityType, pos?: Pos, nbt?: Nbt): SummonBuilder;
  }
}

FunctionContext.prototype.summon = function (this: FunctionContext, entity: EntityType, pos?: Pos, nbt?: Nbt) {
  const node = new TreeCommandNode("summon");
  this.emit(node);
  const parts: CommandPart[] = [litPart("summon"), argPart(entity)];
  if (pos !== undefined) parts.push(argPart(pos));
  if (nbt !== undefined) {
    warnRawEntityNbt(nbt, entity.render());
    parts.push(argPart(nbt));
  }
  node.parts = parts;
  return new SummonBuilder(node);
};
