// Projectile profiles: gravity, drag and tick order for each summonable projectile.
/**
 * Minecraft's per-tick projectile physics, in vanilla's exact order.
 *
 * The order changes the curve, so it's copied from the game:
 *
 * ```
 * PrimedTnt.tick():                         AbstractArrow / ThrowableProjectile.tick():
 *   if (!isNoGravity()) applyGravity();       move(SELF, deltaMovement);
 *   move(SELF, deltaMovement);                setDeltaMovement(delta.scale(inertia));
 *   setDeltaMovement(delta.scale(0.98));      if (!isNoGravity())
 *   if (onGround()) delta.multiply(.7,-.5,.7)   setDeltaMovement(delta.add(0,-gravity,0));
 *
 * LivingEntity.travel():                    // mobs, players, armor stands
 *   vec = handleRelativeFrictionAndCalculateMovement(...)   // this is the move
 *   double y = vec.y - getGravity();                        // 0.08
 *   float f1 = onGround() ? friction * 0.91F : 0.91F;
 *   setDeltaMovement(vec.x * f1, y * 0.98, vec.z * f1);
 * ```
 *
 * Drag is a constant scale and gravity a constant step, so position is affine in launch
 * velocity. That's what lets `solve.ts` invert it exactly.
 *
 * Axes: +X east, +Y up, +Z south. Yaw 0 faces south and increases clockwise; pitch is
 * negative
 * upward. TNT ignores rotation; yaw/pitch are just the direction of its `Motion`.
 */
export type TickOrder =
  /** `PrimedTnt`, `FallingBlockEntity`. */
  | "gravity-move-drag"
  /** `AbstractArrow`, `ThrowableProjectile`. */
  | "move-drag-gravity"
  /** `LivingEntity` - the gravity step is applied to the post-move delta, then dragged. */
  | "move-gravity-drag";

export interface ProjectileProfile {
  /** The entity id to `/summon`. */
  readonly id: string;
  /** Blocks/tick² subtracted from `vy` once per tick (`Entity.getDefaultGravity()`). */
  readonly gravity: number;
  /** Per-tick horizontal velocity multiplier. */
  readonly drag: number;
  /**
   * Per-tick vertical multiplier, if different from {@link drag} (living entities use
   * 0.98).
   */
  readonly dragY?: number;
  /** Where gravity falls relative to the move and drag. Changes the curve. */
  readonly order: TickOrder;
  /** `fuse` ticks a `/summon`ed one starts with, where the entity has a fuse at all. */
  readonly defaultFuse?: number;
}

/**
 * Projectiles that only feel drag and gravity, so the solver is exact for them.
 *
 * Fireballs, wind charges and shulker bullets are left out: they accelerate or steer
 * themselves.
 */
export const PROJECTILES = {
  /** `PrimedTnt`, the default. Gravity before the move, 2% drag. */
  tnt: { id: "minecraft:tnt", gravity: 0.04, drag: 0.98, order: "gravity-move-drag", defaultFuse: 80 },
  /** `FallingBlockEntity` - identical integrator to TNT, no fuse. */
  falling_block: { id: "minecraft:falling_block", gravity: 0.04, drag: 0.98, order: "gravity-move-drag" },
  /** `Arrow`: 1% drag, gravity after the move. */
  arrow: { id: "minecraft:arrow", gravity: 0.05, drag: 0.99, order: "move-drag-gravity" },
  spectral_arrow: { id: "minecraft:spectral_arrow", gravity: 0.05, drag: 0.99, order: "move-drag-gravity" },
  trident: { id: "minecraft:trident", gravity: 0.05, drag: 0.99, order: "move-drag-gravity" },
  /** `ThrowableItemProjectile` family - lighter gravity than an arrow. */
  snowball: { id: "minecraft:snowball", gravity: 0.03, drag: 0.99, order: "move-drag-gravity" },
  egg: { id: "minecraft:egg", gravity: 0.03, drag: 0.99, order: "move-drag-gravity" },
  ender_pearl: { id: "minecraft:ender_pearl", gravity: 0.03, drag: 0.99, order: "move-drag-gravity" },
  splash_potion: { id: "minecraft:splash_potion", gravity: 0.05, drag: 0.99, order: "move-drag-gravity" },
  experience_bottle: { id: "minecraft:experience_bottle", gravity: 0.07, drag: 0.99, order: "move-drag-gravity" },
  llama_spit: { id: "minecraft:llama_spit", gravity: 0.06, drag: 0.99, order: "move-drag-gravity" },
  /**
   * `LivingEntity`: every mob and the armor stand. The summoned entity comes from the
   * shell.
   *
   * Mobs with AI steer a little mid-air and land slightly off; `no_ai` mobs and armor
   * stands are exact.
   */
  living: { id: "minecraft:armor_stand", gravity: 0.08, drag: 0.91, dragY: 0.98, order: "move-gravity-drag" },
} as const satisfies Record<string, ProjectileProfile>;

/**
 * Max Motion per axis. Vanilla zeroes (not clamps) larger values, so the solver rejects
 * them.
 */
export const MOTION_AXIS_LIMIT = 10;
