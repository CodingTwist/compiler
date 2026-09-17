// Rays against bodies: where a look or a shot first meets a cube.
import { and, math } from "helix";
import type { FunctionContext, ScoreVec3 } from "helix";
import type { Ray } from "../raycast";
import { type RigidState } from "./state";
import { halfExtents } from "./world";

/** No hit: further than any range, in blocks. */
const MISS = 1e6;

const rayOf = (s: RigidState): Ray => ({ origin: s.vector("ray_o"), dir: s.vector("ray_d") });

/**
 * Runs `onHit` as the nearest body the ray meets within `range` blocks, with the hit point
 * in `point`. `dp.lookRay()` gives a ray along a player's view.
 */
export function raycast(
  s: RigidState,
  ctx: FunctionContext,
  ray: Ray,
  range: number,
  onHit: (ctx: FunctionContext, point: ScoreVec3) => void,
): void {
  const { origin, dir } = rayOf(s);
  // Copied into scratch so the one `ray` function serves every caller's ray.
  origin.assign(ray.origin, ctx);
  dir.assign(ray.dir, ctx);
  const best = s.scalar("ray_best");
  best.set(range);
  ctx.execute().as(s.bodies()).run((b) => b.call(s.fn.ray));
  ctx.execute().as(s.bodies()).ifScore(s.body.ray, "=", best).run((b) => {
    const point = s.vector("ray_hit");
    math`${origin} + ${dir} * ${best}`.into(point, b);
    onHit(b, point);
  });
}

/**
 * Builds `ray`: the slab test in the executing body's own frame. Writes the entry distance
 * to its `rb.ray` score, or {@link MISS}, and lowers `#ray_best` on a nearer hit.
 */
export function defineRay(s: RigidState): void {
  const { pos, half, ray } = s.body;
  s.fn.ray.build((ctx) => {
    const { origin, dir } = rayOf(s);
    const h = [0, 1, 2].map((k) => s.vector(`h${k}`));
    halfExtents(s, h);
    const rel = s.vector("ray_rel");
    const lo = [0, 1, 2].map((k) => s.scalar(`ray_lo${k}`));
    const ld = [0, 1, 2].map((k) => s.scalar(`ray_ld${k}`));
    math`${origin} - ${pos}`.into(rel);
    for (let k = 0; k < 3; k++) {
      math`${rel} · ${h[k]} / ${half}`.into(lo[k]);
      math`${dir} · ${h[k]} / ${half}`.into(ld[k]);
      // A zero would divide by zero; 0.001 is a twentieth of a degree off parallel.
      ctx.if(ld[k].equal(0), (b) => ld[k].set(0.001, b));
    }
    const slab = (k: number, near: boolean) => {
      const [a, b] = [math`(-${half} - ${lo[k]}) / ${ld[k]}`, math`(${half} - ${lo[k]}) / ${ld[k]}`];
      return near ? math`min(${a}, ${b})` : math`max(${a}, ${b})`;
    };
    const enter = s.scalar("ray_in");
    const exit = s.scalar("ray_out");
    math`max(max(${slab(0, true)}, ${slab(1, true)}), ${slab(2, true)})`.into(enter);
    math`min(min(${slab(0, false)}, ${slab(1, false)}), ${slab(2, false)})`.into(exit);
    ray.set(MISS);
    const best = s.scalar("ray_best");
    ctx.if(and(enter.lessThan(exit), exit.greaterThan(0)), (b) => {
      math`max(${enter}, 0)`.into(ray, b);
      b.if(ray.lessThan(best), (c) => best.assign(ray, c));
    });
  });
}
