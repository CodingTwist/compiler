// Hand-refined (see HAND_REFINED in scripts/gen-commands.mjs) -- not regenerated.
import { CommandPart, TreeCommandNode } from "../ir/node";
import { FunctionContext } from "../frontend/context";
import { CommandBuilder, litPart, argPart } from "./base";
import { SoundEvent } from "../values";
import { Selector } from "../frontend/nodes/selector";

/** `stopsound` */
export class StopsoundBuilder extends CommandBuilder<TreeCommandNode> {
  /** `stopsound <targets> * [sound]` - every category at once (the source-argument wildcard, hand-added: the generator's endpoint walk doesn't produce a method for a bare `*` literal branch). */
  any(targets: Selector, sound?: SoundEvent): this {
    this.$set(litPart("stopsound"), argPart(targets), litPart("*"));
    if (sound !== undefined) this.$append(argPart(sound));
    return this;
  }

  ambient(targets: Selector, sound?: SoundEvent): this {
    this.$set(litPart("stopsound"), argPart(targets), litPart("ambient"));
    if (sound !== undefined) this.$append(argPart(sound));
    return this;
  }

  block(targets: Selector, sound?: SoundEvent): this {
    this.$set(litPart("stopsound"), argPart(targets), litPart("block"));
    if (sound !== undefined) this.$append(argPart(sound));
    return this;
  }

  hostile(targets: Selector, sound?: SoundEvent): this {
    this.$set(litPart("stopsound"), argPart(targets), litPart("hostile"));
    if (sound !== undefined) this.$append(argPart(sound));
    return this;
  }

  master(targets: Selector, sound?: SoundEvent): this {
    this.$set(litPart("stopsound"), argPart(targets), litPart("master"));
    if (sound !== undefined) this.$append(argPart(sound));
    return this;
  }

  music(targets: Selector, sound?: SoundEvent): this {
    this.$set(litPart("stopsound"), argPart(targets), litPart("music"));
    if (sound !== undefined) this.$append(argPart(sound));
    return this;
  }

  neutral(targets: Selector, sound?: SoundEvent): this {
    this.$set(litPart("stopsound"), argPart(targets), litPart("neutral"));
    if (sound !== undefined) this.$append(argPart(sound));
    return this;
  }

  player(targets: Selector, sound?: SoundEvent): this {
    this.$set(litPart("stopsound"), argPart(targets), litPart("player"));
    if (sound !== undefined) this.$append(argPart(sound));
    return this;
  }

  record(targets: Selector, sound?: SoundEvent): this {
    this.$set(litPart("stopsound"), argPart(targets), litPart("record"));
    if (sound !== undefined) this.$append(argPart(sound));
    return this;
  }

  ui(targets: Selector, sound?: SoundEvent): this {
    this.$set(litPart("stopsound"), argPart(targets), litPart("ui"));
    if (sound !== undefined) this.$append(argPart(sound));
    return this;
  }

  voice(targets: Selector, sound?: SoundEvent): this {
    this.$set(litPart("stopsound"), argPart(targets), litPart("voice"));
    if (sound !== undefined) this.$append(argPart(sound));
    return this;
  }

  weather(targets: Selector, sound?: SoundEvent): this {
    this.$set(litPart("stopsound"), argPart(targets), litPart("weather"));
    if (sound !== undefined) this.$append(argPart(sound));
    return this;
  }
}

declare module "../frontend/context" {
  interface FunctionContext {
    /** `stopsound` - `ctx.stopsound()...` */
    stopsound(targets?: Selector): StopsoundBuilder;
  }
}

FunctionContext.prototype.stopsound = function (this: FunctionContext, targets?: Selector) {
  const node = new TreeCommandNode("stopsound");
  this.emit(node);
  const parts: CommandPart[] = [litPart("stopsound")];
  if (targets !== undefined) parts.push(argPart(targets));
  node.parts = parts;
  return new StopsoundBuilder(node);
};
