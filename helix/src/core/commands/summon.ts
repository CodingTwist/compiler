// HAND-REFINED (in gen-commands.mjs's HAND_REFINED so it survives a regen): generated shape
// plus the raw-NBT warning.
import { CommandPart, TreeCommandNode } from "../ir/node";
import { Effect } from "../ir/line-info";
import { FunctionContext } from "../frontend/context";
import { CommandBuilder, litPart, argPart } from "./base";
import { EntityNbtValue, EntityType, type IdentifiedEntityNbt, Nbt, Pos, warnRawEntityNbt } from "../values";

/** `summon` */
export class SummonBuilder extends CommandBuilder<TreeCommandNode> {

}

declare module "../frontend/context" {
  interface FunctionContext {
    /** `summon` - `ctx.summon()...` */
    summon(entity: EntityType, pos?: Pos, nbt?: Nbt): SummonBuilder;
    /** `summon` from an entity schema, e.g. `ctx.summon(Villager({ level: 2 }), pos)`. */
    summon(nbt: IdentifiedEntityNbt, pos?: Pos): SummonBuilder;
  }
}

FunctionContext.prototype.summon = function (
  this: FunctionContext,
  entity: EntityType | IdentifiedEntityNbt,
  pos?: Pos,
  nbt?: Nbt,
) {
  // The one-argument form: the concept carries the id, so shift it into place.
  if (entity instanceof EntityNbtValue) [entity, nbt, pos] = [EntityType(entity.entity), entity, pos];
  const node = new TreeCommandNode("summon", Effect.EDITS);
  this.emit(node);
  const parts: CommandPart[] = [litPart("summon"), argPart(entity)];
  // Brigadier can't skip an optional argument, so NBT without a position fails to parse.
  // Default to `~ ~ ~`.
  if (pos !== undefined) parts.push(argPart(pos));
  else if (nbt !== undefined) parts.push(argPart(Pos.here()));
  if (nbt !== undefined) {
    warnRawEntityNbt(nbt, entity.render());
    parts.push(argPart(nbt));
  }
  node.parts = parts;
  return new SummonBuilder(node);
};
