// Hand-refined (see HAND_REFINED in scripts/gen-commands.mjs) -- not regenerated.
//
//   ctx.playsound(SoundEvent.ITEM_CROSSBOW_SHOOT, { source: SoundSource.HOSTILE, volume: 1.2 });
import { CommandPart, TreeCommandNode } from "../ir/node";
import { Effect } from "../ir/line-info";
import { FunctionContext } from "../frontend/context";
import { CommandBuilder, litPart, argPart } from "./base";
import { Pos, SoundEvent, SoundSource } from "../values";
import { Selector } from "../frontend/nodes/selector";

/** `playsound` */
export class PlaysoundBuilder extends CommandBuilder<TreeCommandNode> {
  ambient(sound: SoundEvent, targets?: Selector, pos?: Pos, volume?: number, pitch?: number, minVolume?: number): this {
    this.$set(litPart("playsound"), argPart(sound), litPart("ambient"));
    if (targets !== undefined) this.$append(argPart(targets));
    if (pos !== undefined) this.$append(argPart(pos));
    if (volume !== undefined) this.$append(argPart(volume));
    if (pitch !== undefined) this.$append(argPart(pitch));
    if (minVolume !== undefined) this.$append(argPart(minVolume));
    return this;
  }

  block(sound: SoundEvent, targets?: Selector, pos?: Pos, volume?: number, pitch?: number, minVolume?: number): this {
    this.$set(litPart("playsound"), argPart(sound), litPart("block"));
    if (targets !== undefined) this.$append(argPart(targets));
    if (pos !== undefined) this.$append(argPart(pos));
    if (volume !== undefined) this.$append(argPart(volume));
    if (pitch !== undefined) this.$append(argPart(pitch));
    if (minVolume !== undefined) this.$append(argPart(minVolume));
    return this;
  }

  hostile(sound: SoundEvent, targets?: Selector, pos?: Pos, volume?: number, pitch?: number, minVolume?: number): this {
    this.$set(litPart("playsound"), argPart(sound), litPart("hostile"));
    if (targets !== undefined) this.$append(argPart(targets));
    if (pos !== undefined) this.$append(argPart(pos));
    if (volume !== undefined) this.$append(argPart(volume));
    if (pitch !== undefined) this.$append(argPart(pitch));
    if (minVolume !== undefined) this.$append(argPart(minVolume));
    return this;
  }

  master(sound: SoundEvent, targets?: Selector, pos?: Pos, volume?: number, pitch?: number, minVolume?: number): this {
    this.$set(litPart("playsound"), argPart(sound), litPart("master"));
    if (targets !== undefined) this.$append(argPart(targets));
    if (pos !== undefined) this.$append(argPart(pos));
    if (volume !== undefined) this.$append(argPart(volume));
    if (pitch !== undefined) this.$append(argPart(pitch));
    if (minVolume !== undefined) this.$append(argPart(minVolume));
    return this;
  }

  music(sound: SoundEvent, targets?: Selector, pos?: Pos, volume?: number, pitch?: number, minVolume?: number): this {
    this.$set(litPart("playsound"), argPart(sound), litPart("music"));
    if (targets !== undefined) this.$append(argPart(targets));
    if (pos !== undefined) this.$append(argPart(pos));
    if (volume !== undefined) this.$append(argPart(volume));
    if (pitch !== undefined) this.$append(argPart(pitch));
    if (minVolume !== undefined) this.$append(argPart(minVolume));
    return this;
  }

  neutral(sound: SoundEvent, targets?: Selector, pos?: Pos, volume?: number, pitch?: number, minVolume?: number): this {
    this.$set(litPart("playsound"), argPart(sound), litPart("neutral"));
    if (targets !== undefined) this.$append(argPart(targets));
    if (pos !== undefined) this.$append(argPart(pos));
    if (volume !== undefined) this.$append(argPart(volume));
    if (pitch !== undefined) this.$append(argPart(pitch));
    if (minVolume !== undefined) this.$append(argPart(minVolume));
    return this;
  }

  player(sound: SoundEvent, targets?: Selector, pos?: Pos, volume?: number, pitch?: number, minVolume?: number): this {
    this.$set(litPart("playsound"), argPart(sound), litPart("player"));
    if (targets !== undefined) this.$append(argPart(targets));
    if (pos !== undefined) this.$append(argPart(pos));
    if (volume !== undefined) this.$append(argPart(volume));
    if (pitch !== undefined) this.$append(argPart(pitch));
    if (minVolume !== undefined) this.$append(argPart(minVolume));
    return this;
  }

  record(sound: SoundEvent, targets?: Selector, pos?: Pos, volume?: number, pitch?: number, minVolume?: number): this {
    this.$set(litPart("playsound"), argPart(sound), litPart("record"));
    if (targets !== undefined) this.$append(argPart(targets));
    if (pos !== undefined) this.$append(argPart(pos));
    if (volume !== undefined) this.$append(argPart(volume));
    if (pitch !== undefined) this.$append(argPart(pitch));
    if (minVolume !== undefined) this.$append(argPart(minVolume));
    return this;
  }

  ui(sound: SoundEvent, targets?: Selector, pos?: Pos, volume?: number, pitch?: number, minVolume?: number): this {
    this.$set(litPart("playsound"), argPart(sound), litPart("ui"));
    if (targets !== undefined) this.$append(argPart(targets));
    if (pos !== undefined) this.$append(argPart(pos));
    if (volume !== undefined) this.$append(argPart(volume));
    if (pitch !== undefined) this.$append(argPart(pitch));
    if (minVolume !== undefined) this.$append(argPart(minVolume));
    return this;
  }

  voice(sound: SoundEvent, targets?: Selector, pos?: Pos, volume?: number, pitch?: number, minVolume?: number): this {
    this.$set(litPart("playsound"), argPart(sound), litPart("voice"));
    if (targets !== undefined) this.$append(argPart(targets));
    if (pos !== undefined) this.$append(argPart(pos));
    if (volume !== undefined) this.$append(argPart(volume));
    if (pitch !== undefined) this.$append(argPart(pitch));
    if (minVolume !== undefined) this.$append(argPart(minVolume));
    return this;
  }

  weather(sound: SoundEvent, targets?: Selector, pos?: Pos, volume?: number, pitch?: number, minVolume?: number): this {
    this.$set(litPart("playsound"), argPart(sound), litPart("weather"));
    if (targets !== undefined) this.$append(argPart(targets));
    if (pos !== undefined) this.$append(argPart(pos));
    if (volume !== undefined) this.$append(argPart(volume));
    if (pitch !== undefined) this.$append(argPart(pitch));
    if (minVolume !== undefined) this.$append(argPart(minVolume));
    return this;
  }
}

/** Named arguments for `ctx.playsound(sound, options)`. */
export interface SoundOptions {
  source: SoundSource;
  /** Who hears it. Default every player in range. */
  to?: Selector;
  /** Where it plays. Default `~ ~ ~`. */
  at?: Pos;
  /** Default 1. */
  volume?: number;
  /** Default 1. */
  pitch?: number;
  /** Volume for players out of range. Default 0. */
  minVolume?: number;
}

declare module "../frontend/context" {
  interface FunctionContext {
    /** Plays `sound`; options left out take their defaults. */
    playsound(sound: SoundEvent, options: SoundOptions): void;
    /** `playsound` - `ctx.playsound()...` */
    playsound(sound?: SoundEvent): PlaysoundBuilder;
  }
}

FunctionContext.prototype.playsound = function (this: FunctionContext, sound?: SoundEvent, options?: SoundOptions) {
  const node = new TreeCommandNode("playsound", { effect: Effect.NONE });
  this.emit(node);
  const parts: CommandPart[] = [litPart("playsound")];
  if (sound !== undefined) parts.push(argPart(sound));
  if (options !== undefined) {
    const { source, to = Selector.allPlayers(), at = Pos.here(), volume, pitch, minVolume } = options;
    parts.push(litPart(source), argPart(to), argPart(at));
    // Each trailing argument needs the ones before it.
    if (volume !== undefined || pitch !== undefined || minVolume !== undefined) parts.push(argPart(volume ?? 1));
    if (pitch !== undefined || minVolume !== undefined) parts.push(argPart(pitch ?? 1));
    if (minVolume !== undefined) parts.push(argPart(minVolume));
    node.parts = parts;
    return;
  }
  node.parts = parts;
  return new PlaysoundBuilder(node);
} as FunctionContext["playsound"];
