/**
 * The `rigidbody` plugin: rotating physics cubes, ported from SethBling's cbscript engine.
 *
 *   installKit([rigidbody]);
 *   const rb = dp.rigidbody();
 *   dp.createFunction("drop").build((ctx) => rb.spawn(ctx, { item: Item.TARGET, rotation: quat("x", 30) }));
 *
 * Needs 26.3+ (`/compute`). Bodies collide with world blocks and each other; spawn
 * bodies bigger than 1 block with `maxSize` set.
 */
import { Datapack, Marker, Range, Selector } from "helix";
import type { FunctionContext, ScoreVec3 } from "helix";
import type { KitPlugin } from "../../plugin";
import { createState, PROBE_UUID_INTS, SLOTS, VERTICES, type RigidState } from "./state";
import { DEFAULT_TUNING, type RigidTuning } from "./tuning";
import { integrate } from "./integrate";
import { collideWorld, defineDetect, halfExtents, PASSTHROUGH } from "./world";
import { defineSolve } from "./solve";
import { definePass, resolvePenetration } from "./passes";
import { collidePairs, definePairs } from "./pairs";
import { checkSleep, render, RENDER_INIT } from "./render";
import { defineImpulse, spawnBody, type SpawnOptions } from "./body";
import { defineRay, raycast } from "./ray";
import type { Ray } from "../raycast";
import { pointOnBody, spring, type LocalPoint, type SpringOptions } from "./spring";

export type { RigidTuning } from "./tuning";
export type { SpawnOptions } from "./body";
export type { LocalPoint, SpringOptions } from "./spring";

/** Options for {@link Datapack.rigidbody}. */
export interface RigidOptions extends Partial<RigidTuning> {
  /** Blocks bodies fall through. Defaults to air, water, lava, light and structure voids. */
  readonly passthrough?: readonly string[];
}

/** The handle `dp.rigidbody()` returns. */
export interface RigidBodies {
  /** Summons a body at the current position. */
  spawn(ctx: FunctionContext, opts: SpawnOptions): void;
  /** Applies {@link input} to the executing body. */
  impulse(ctx: FunctionContext): void;
  /** Where to write an impulse before {@link impulse}: world point and impulse vector, both mm. */
  readonly input: { readonly point: ScoreVec3; readonly impulse: ScoreVec3 };
  /** Keeps the executing body within a rope's length of an anchor. Call it after the physics tick. */
  spring(ctx: FunctionContext, opts: SpringOptions): void;
  /** Writes the executing body's three half-edge vectors (mm) into scratch and returns them. */
  halfAxes(): ScoreVec3[];
  /** Writes where `local` on the executing body is in the world (mm). */
  pointOnBody(ctx: FunctionContext, local: LocalPoint, into: ScoreVec3): void;
  /** Runs `onHit` as the nearest body `ray` meets within `range` blocks, with the hit point (mm). */
  raycast(ctx: FunctionContext, ray: Ray, range: number, onHit: (ctx: FunctionContext, point: ScoreVec3) => void): void;
  /** `@e[tag=rb.body]`. */
  bodies(): Selector;
  /** The executing body's state scores, for game code (position, velocity, …). */
  readonly body: RigidState["body"];
}

const installed = new WeakMap<Datapack, RigidBodies>();

function defineRigidBodies(dp: Datapack, opts: RigidOptions): RigidBodies {
  const t: RigidTuning = { ...DEFAULT_TUNING, ...opts };
  const s = createState(dp);
  const input = { point: s.vector("in_p"), impulse: s.vector("in_j") };

  dp.tag("block", PASSTHROUGH, {
    values: [...(opts.passthrough ?? ["#minecraft:air", "minecraft:water", "minecraft:lava", "minecraft:light", "minecraft:structure_void"])],
  });

  s.fn.init.build((ctx) => {
    for (const o of s.objectives) o.init();
    ctx.storage(s.render).mergeAll(RENDER_INIT);
  });

  s.fn.tick.build((ctx) => {
    // The probe follows the bodies; summon it next to one if it's missing.
    ctx
      .execute()
      .unlessEntity(s.probe())
      .as(s.bodies().limit(1))
      .at(Selector.self())
      .run((b) => b.summon(Marker({ uuid: PROBE_UUID_INTS })));
    ctx
      .execute()
      .as(s.bodies().score(s.body.sleeping.objective, new Range(0, 0)))
      .run((b) => b.call(s.fn.step));
  });

  s.fn.step.build((ctx) => {
    integrate(s, t);
    collideWorld(s, ctx);
    s.scalar("pass").set(t.passes);
    ctx.call(s.fn.solvePass);
    collidePairs(s, t, ctx);
    resolvePenetration(s, t, ctx);
    render(s, ctx);
    checkSleep(s, t.sleepBelow, ctx);
  });

  // No command moves an entity to score coordinates or sets a display's rotation.
  dp.allow("nbt-write", s.fn.step, "probe move and render merge: one entity write each, no command form");

  for (let i = 0; i < VERTICES; i++) defineDetect(s, t, i);
  for (let i = 0; i < SLOTS; i++) defineSolve(s, t, i);
  definePass(s, s.fn.solvePass, VERTICES);
  definePass(s, s.fn.pairPass, SLOTS);
  definePairs(s, t);
  defineImpulse(s, input);
  defineRay(s);

  return {
    spawn: (ctx, o) => spawnBody(s, ctx, o),
    impulse: (ctx) => ctx.call(s.fn.impulse),
    spring: (ctx, o) => spring(s, t.gravity, ctx, o, input),
    halfAxes: () => {
      const h = [0, 1, 2].map((k) => s.vector(`h${k}`));
      halfExtents(s, h);
      return h;
    },
    pointOnBody: (ctx, local, into) => pointOnBody(s, ctx, local, into),
    raycast: (ctx, ray, range, onHit) => raycast(s, ctx, ray, range, onHit),
    input,
    bodies: s.bodies,
    body: s.body,
  };
}

declare module "helix" {
  interface Datapack {
    /** Installs the rigid-body engine (once per pack; later options are ignored) and returns its handle. */
    rigidbody(opts?: RigidOptions): RigidBodies;
  }
}

export const rigidbody: KitPlugin = {
  name: "rigidbody",
  install() {
    Datapack.prototype.rigidbody = function (this: Datapack, opts: RigidOptions = {}) {
      const existing = installed.get(this);
      if (existing) return existing;
      const rb = defineRigidBodies(this, opts);
      installed.set(this, rb);
      return rb;
    };
  },
};
