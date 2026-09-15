// Cube-vs-world contacts: each vertex inside a solid block becomes a contact on that block's face.
import { Block, Detect, Pos, math, and } from "helix";
import type { FunctionContext, Score, ScoreVec3 } from "helix";
import { VERTICES, type RigidState } from "./state";
import { prepareContact } from "./solve";
import type { RigidTuning } from "./tuning";

/** The block tag bodies pass through; everything else is solid. */
export const PASSTHROUGH = "rb/passthrough";

/**
 * Finds this tick's world contacts for the executing body, filling one slot per vertex.
 *
 * ponytail: vertex-into-block only. A block's corner poking into a cube face, or edge-on-edge,
 * is missed (SethBling's full SAT); add it if cubes visibly snag on block edges.
 */
export function collideWorld(s: RigidState, ctx: FunctionContext): void {
  const { pos } = s.body;
  s.count("hits").set(0);
  const h = [0, 1, 2].map((i) => s.vector(`h${i}`));
  halfExtents(s, h);

  for (let i = 0; i < VERTICES; i++) {
    const c = s.contact(i);
    const [sx, sy, sz] = [i & 1, i & 2, i & 4].map((b) => (b ? 1 : -1));
    c.hit.set(0);
    math`${pos} + ${sx} * ${h[0]} + ${sy} * ${h[1]} + ${sz} * ${h[2]}`.into(c.point);
    s.locator.moveTo(ctx, c.point);
    ctx
      .execute()
      .at(s.locator.selector())
      .unlessBlock(Pos.here(), Block.tag(`${s.dp.name}:${PASSTHROUGH}`))
      .run((b) => b.call(s.fn.detect[i]));
  }
}

/** The cube's three half-edge vectors in world space: the rotation matrix's columns × half. */
export function halfExtents(s: RigidState, [h0, h1, h2]: ScoreVec3[]): void {
  const { half, qw: w } = s.body;
  const { x: i, y: j, z: k } = s.body.qv;
  math`vec(1 - 2 * (${j} * ${j} + ${k} * ${k}), 2 * (${i} * ${j} + ${k} * ${w}), 2 * (${i} * ${k} - ${j} * ${w})) * ${half}`.into(h0);
  math`vec(2 * (${i} * ${j} - ${k} * ${w}), 1 - 2 * (${i} * ${i} + ${k} * ${k}), 2 * (${j} * ${k} + ${i} * ${w})) * ${half}`.into(h1);
  math`vec(2 * (${i} * ${k} + ${j} * ${w}), 2 * (${j} * ${k} - ${i} * ${w}), 1 - 2 * (${i} * ${i} + ${j} * ${j})) * ${half}`.into(h2);
}

/** The six block faces: probe offset to the neighbour, and normal axis/sign. */
const FACES = [
  { off: [0, 1, 0], axis: 1, sign: 1 },
  { off: [0, -1, 0], axis: 1, sign: -1 },
  { off: [1, 0, 0], axis: 0, sign: 1 },
  { off: [-1, 0, 0], axis: 0, sign: -1 },
  { off: [0, 0, 1], axis: 2, sign: 1 },
  { off: [0, 0, -1], axis: 2, sign: -1 },
] as const;

/**
 * Builds `rb/contact/detect_<i>`: picks the exit face for a vertex inside a solid block.
 *
 * Prefers open faces the body is moving into (so a cube landing near a ledge isn't shoved
 * sideways off it), then any open face, then straight up. Shallowest wins. Run as the body, at
 * the probe.
 */
export function defineDetect(s: RigidState, t: RigidTuning, i: number): void {
  const c = s.contact(i);
  const open = Block.tag(`${s.dp.name}:${PASSTHROUGH}`);
  s.fn.detect[i].build((ctx) => {
    const frac = s.vector("frac");
    const depth = s.scalar("face_d");
    const best = c.depth;
    // Distance from the block's low corner, 0 to 1.
    math`${c.point} - vec(floor(${c.point.x}), floor(${c.point.y}), floor(${c.point.z}))`.into(frac);
    best.set(NONE);

    const tryFaces = (b: FunctionContext, movingIn: boolean) => {
      for (const f of FACES) {
        const along: Score = frac.components[f.axis];
        const v = s.body.vel.components[f.axis];
        b.if(and(Detect.block(Pos.rel(...f.off), open), ...(movingIn ? [f.sign > 0 ? v.lessThan(0) : v.greaterThan(0)] : [])), (d) => {
          if (f.sign > 0) math`1 - ${along}`.into(depth);
          else depth.assign(along);
          d.if(depth.lessThan(best), (e) => {
            best.assign(depth, e);
            c.normal.components.forEach((n, axis) => n.set(axis === f.axis ? f.sign : 0, e));
          });
        });
      }
    };
    tryFaces(ctx, true);
    ctx.if(best.equal(NONE), (b) => tryFaces(b, false));
    ctx.if(best.equal(NONE), (b) => {
      math`1 - ${frac.y}`.into(best);
      c.normal.components.forEach((n, axis) => n.set(axis === 1 ? 1 : 0, b));
    });
    c.hit.set(1);
    s.count("hits").add(1);
    prepareContact(s, t, ctx, i);
  });
}

/** Depth sentinel: deeper than any face, so no face is chosen yet. */
const NONE = 1.001;
