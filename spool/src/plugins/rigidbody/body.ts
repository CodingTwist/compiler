// Spawning bodies and pushing them.
import { EntityType, Float, ItemDisplay, Nbt, Path, Pos, Selector, math } from "helix";
import type { FunctionContext, ItemValue, Quat, ScoreVec3 } from "helix";
import { MM, Q, SPIN_PER_TORQUE, type RigidState } from "./state";

/** What {@link spawnBody} summons. */
export interface SpawnOptions {
  /** The item the cube shows; a block item renders as that block. */
  readonly item: ItemValue;
  /** Edge length in blocks. Defaults to 1. */
  readonly size?: number;
  /** Inverse mass ×1000: bigger is lighter. Defaults to 800. */
  readonly invMass?: number;
  /** Inverse rotational inertia ×1000: bigger spins easier. Defaults to 200. */
  readonly invInertia?: number;
  /** Starting orientation as [x, y, z, w], e.g. helix `quat("x", 30)`. */
  readonly rotation?: Quat;
  /** Extra entity tags, so game code can find its own bodies. */
  readonly tags?: readonly string[];
}

/** Summons a body at the current position and seeds its state. */
export function spawnBody(s: RigidState, ctx: FunctionContext, o: SpawnOptions): void {
  const size = o.size ?? 1;
  const [x, y, z, w] = o.rotation ?? [0, 0, 0, 1];
  ctx.summon(
    ItemDisplay({
      item: o.item.stackNbt(),
      itemDisplay: "none",
      tags: ["rb.body", "rb.new", ...(o.tags ?? [])],
      teleportDuration: 1,
      interpolationDuration: 1,
      transformation: Nbt({
        left_rotation: [x, y, z, w].map(Float),
        right_rotation: [0, 0, 0, 1].map(Float),
        translation: [0, 0, 0].map(Float),
        scale: [size, size, size].map(Float),
      }),
    }),
    Pos.here(),
  );
  const fresh = Selector.allEntities().type(EntityType.ITEM_DISPLAY).tag("rb.new").limit(1);
  ctx.execute().as(fresh).run((b) => {
    const { body } = s;
    body.pos.readEntity(Selector.self(), Path.Entity.Pos, MM, { ctx: b });
    for (const v of [body.vel, body.spin]) v.components.forEach((c) => c.set(0, b));
    body.qw.set(Math.round(w * Q), b);
    [x, y, z].forEach((q, i) => body.qv.components[i].set(Math.round(q * Q), b));
    body.half.set(Math.round((size * MM) / 2), b);
    body.invMass.set(o.invMass ?? 800, b);
    body.invInertia.set(o.invInertia ?? 200, b);
    wake(s, b);
    b.tag().remove(Selector.self(), "rb.new");
  });
}

/**
 * Builds `rb/impulse`: applies `input.impulse` at world point `input.point` (mm) to the
 * executing body and wakes it.
 */
export function defineImpulse(s: RigidState, input: { point: ScoreVec3; impulse: ScoreVec3 }): void {
  const { pos, vel, spin, invMass: im, invInertia: ii } = s.body;
  s.fn.impulse.build((ctx) => {
    const r = s.vector("ir");
    math`${input.point} - ${pos}`.into(r);
    math`${vel} + ${input.impulse} * ${im} / 1000`.into(vel);
    math`${spin} + cross(${r}, ${input.impulse}) * ${SPIN_PER_TORQUE} * ${ii}`.into(spin);
    wake(s, ctx);
  });
}

/** Clears the sleep flag and primes the motion sum so the body can't fall straight back asleep. */
function wake(s: RigidState, ctx: FunctionContext): void {
  s.body.sleeping.set(0, ctx);
  s.body.motion.set(10000, ctx);
}
