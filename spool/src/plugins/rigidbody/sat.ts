// Body-body contacts by separating axes: the face axis with the least overlap gives the normal,
// and vertices of either box that sit against the other along it become contacts.
import { and, math } from "helix";
import type { Condition, FunctionContext, Score, ScoreVec3 } from "helix";
import { VERTICES, type RigidState } from "./state";
import type { RigidTuning } from "./tuning";

/** An oriented box in scratch: centre and half-edge vectors, and the half edge length. */
interface Box {
  readonly centre: ScoreVec3;
  readonly axes: readonly ScoreVec3[];
  readonly half: Score;
  /** First contact slot holding this box's vertices. */
  readonly slots: number;
}

/** The body being stepped; its axes are the ones world collision computed. */
export const ownBox = (s: RigidState): Box => ({
  centre: s.vector("a.p"),
  axes: [0, 1, 2].map((k) => s.vector(`h${k}`)),
  half: s.scalar("a.half"),
  slots: VERTICES,
});

/** The other body of the pair, copied into scratch. */
export const otherBox = (s: RigidState): Box => ({
  centre: s.other.pos,
  axes: s.other.axes,
  half: s.other.half,
  slots: 2 * VERTICES,
});

/** Axis `m`: the other body's face axes are 0-2, this body's 3-5. */
const axisOf = (s: RigidState, m: number) => {
  const [ref, inc] = m < 3 ? [otherBox(s), ownBox(s)] : [ownBox(s), otherBox(s)];
  // `dot` is a centre offset times a half edge, so it's in blocks².
  return { ref, inc, k: m % 3, dot: s.scalar(`sat_d${m}`, 1e6), overlap: s.scalar(`sat_o${m}`) };
};

/**
 * Finds contacts between the two boxes, when they overlap on all 6 face axes. Run in the pair
 * check, with both boxes and their vertices in scratch.
 *
 * ponytail: face axes only, no edge-edge axes; two cubes crossing edge to edge are pushed apart
 * along a face instead of the true edge normal.
 */
export function findContacts(s: RigidState, ctx: FunctionContext): void {
  const d = math`${ownBox(s).centre} - ${otherBox(s).centre}`;
  const best = s.scalar("sat_best");
  const chosen = s.count("sat_axis");
  for (let m = 0; m < 6; m++) {
    const { ref, inc, k, dot, overlap } = axisOf(s, m);
    const u = ref.axes[k];
    math`${d} · ${u}`.into(dot);
    math`${ref.half} + (abs(${inc.axes[0]} · ${u}) + abs(${inc.axes[1]} · ${u}) + abs(${inc.axes[2]} · ${u}) - abs(${dot})) / ${ref.half}`.into(overlap);
  }
  const overlaps = Array.from({ length: 6 }, (_, m) => axisOf(s, m).overlap);
  ctx.if(and(...overlaps.map((o) => o.greaterThan(0))), (b) => {
    best.assign(overlaps[0], b);
    chosen.set(0, b);
    overlaps.slice(1).forEach((o, n) =>
      b.if(o.lessThan(best), () => {
        best.assign(o);
        chosen.set(n + 1);
      }),
    );
    s.fn.pairAxes.forEach((fn, m) => b.if(chosen.equal(m), (e) => e.call(fn)));
  });
}

/**
 * Builds `rb/pair/axis_<m>`: contacts along axis `m`. Vertices of the other box that crossed the
 * reference face, and vertices of the reference box inside the other box, both within `slop` of
 * the edges, so boxes stacked edge to edge still touch.
 */
export function defineAxes(s: RigidState, t: RigidTuning): void {
  const hits = s.count("pair_hits");
  s.fn.pairAxes.forEach((fn, m) =>
    fn.build((ctx) => {
      const { ref, inc, k, dot } = axisOf(s, m);
      const n = s.vector("sat_n");
      const sign = s.count("sat_sign");
      const local = s.vector("sat_l");
      const depth = s.scalar("sat_depth");
      // The normal points from the other body toward this one, whichever box is the reference.
      sign.set(1);
      ctx.if(dot.lessThan(0), () => sign.set(-1));
      math`${ref.axes[k]} * ${sign} / ${ref.half}`.into(n);

      const hit = (i: number, deep: Score, extra: Condition[]) =>
        ctx.if(and(deep.greaterThan(0), ...extra), () => {
          const c = s.contact(i);
          c.hit.set(1);
          c.normal.assign(n);
          c.depth.assign(deep);
          hits.add(1);
        });
      // How far inside each face of `box` the local point is, counting `slop` past the edge.
      const room = s.vector("sat_room");
      const within = (box: Box) => {
        const lim = math`${box.half} + ${t.slop}`;
        return math`vec(${lim} - abs(${local.x}), ${lim} - abs(${local.y}), ${lim} - abs(${local.z}))`;
      };

      for (let j = 0; j < VERTICES; j++) {
        // A vertex of the incident box: how far past the reference face, and inside its rim.
        const i = inc.slots + j;
        const p = s.contact(i).point;
        math`vec((${p} - ${ref.centre}) · ${ref.axes[0]}, (${p} - ${ref.centre}) · ${ref.axes[1]}, (${p} - ${ref.centre}) · ${ref.axes[2]}) / ${ref.half}`.into(local);
        // This body lies along +n from the other, so its vertices cross the other's face going -n.
        const facing = m < 3 ? math`${ref.half} - ${local.components[k]} * ${sign}` : math`${ref.half} + ${local.components[k]} * ${sign}`;
        facing.into(depth);
        within(ref).into(room);
        hit(i, depth, [0, 1, 2].filter((a) => a !== k).map((a) => room.components[a].atLeast(0)));
      }
      for (let j = 0; j < VERTICES; j++) {
        // A vertex of the reference box inside the incident box sinks by the full overlap.
        const i = ref.slots + j;
        const p = s.contact(i).point;
        math`vec((${p} - ${inc.centre}) · ${inc.axes[0]}, (${p} - ${inc.centre}) · ${inc.axes[1]}, (${p} - ${inc.centre}) · ${inc.axes[2]}) / ${inc.half}`.into(local);
        within(inc).into(room);
        hit(i, s.scalar("sat_best"), room.components.map((r) => r.atLeast(0)));
      }
    }),
  );
}
