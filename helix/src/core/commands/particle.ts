// Hand-refined (see HAND_REFINED in scripts/gen-commands.mjs) -- not regenerated.
//
//   ctx.particle(Particle.CRIT, { at: Pos.rel(0, 1, 0), spread: [0.3, 0.4, 0.3], speed: 0.2, count: 12 });
import { CommandPart, TreeCommandNode } from "../ir/node";
import { Effect } from "../ir/line-info";
import { FunctionContext } from "../frontend/context";
import { CommandBuilder, litPart, argPart } from "./base";
import { Particle, Pos } from "../values";
import { Selector } from "../frontend/nodes/selector";

/** `particle` */
export class ParticleBuilder extends CommandBuilder<TreeCommandNode> {
  force(name: Particle, pos: Pos, delta: Pos, speed: number, count: number, viewers?: Selector): this {
    this.$set(litPart("particle"), argPart(name), argPart(pos), argPart(delta), argPart(speed), argPart(count), litPart("force"));
    if (viewers !== undefined) this.$append(argPart(viewers));
    return this;
  }

  normal(name: Particle, pos: Pos, delta: Pos, speed: number, count: number, viewers?: Selector): this {
    this.$set(litPart("particle"), argPart(name), argPart(pos), argPart(delta), argPart(speed), argPart(count), litPart("normal"));
    if (viewers !== undefined) this.$append(argPart(viewers));
    return this;
  }
}

/** Named arguments for `ctx.particle(name, options)`. */
export interface ParticleOptions {
  /** Where it spawns. Default `~ ~ ~`. */
  at?: Pos;
  /** Random offset per axis, in blocks. Default none. */
  spread?: readonly [number, number, number];
  /** Default 0. */
  speed?: number;
  /** Default 1. Always written, since a left-out count is 0, which makes `spread` a direction. */
  count?: number;
  /** Draws past the viewer's particle settings and distance limit. */
  force?: boolean;
  /** Who sees it. Default everyone in range. */
  viewers?: Selector;
}

declare module "../frontend/context" {
  interface FunctionContext {
    /** Spawns `name` particles; options left out take their defaults. */
    particle(name: Particle, options: ParticleOptions): void;
    /** `particle` - `ctx.particle()...` */
    particle(name?: Particle, pos?: Pos, delta?: Pos, speed?: number, count?: number): ParticleBuilder;
  }
}

FunctionContext.prototype.particle = function (this: FunctionContext, name?: Particle, pos?: Pos | ParticleOptions, delta?: Pos, speed?: number, count?: number) {
  const node = new TreeCommandNode("particle", { effect: Effect.NONE });
  this.emit(node);
  const parts: CommandPart[] = [litPart("particle")];
  if (name !== undefined) parts.push(argPart(name));
  if (pos !== undefined && !("render" in pos)) {
    const o = pos;
    parts.push(argPart(o.at ?? Pos.here()), argPart(Pos(...(o.spread ?? [0, 0, 0]))), argPart(o.speed ?? 0), argPart(o.count ?? 1));
    if (o.force || o.viewers) parts.push(litPart(o.force ? "force" : "normal"));
    if (o.viewers) parts.push(argPart(o.viewers));
    node.parts = parts;
    return;
  }
  if (pos !== undefined) parts.push(argPart(pos));
  if (delta !== undefined) parts.push(argPart(delta));
  if (speed !== undefined) parts.push(argPart(speed));
  if (count !== undefined) parts.push(argPart(count));
  node.parts = parts;
  return new ParticleBuilder(node);
} as FunctionContext["particle"];
