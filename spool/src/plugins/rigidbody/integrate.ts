// One integration step for the executing body: gravity, damping, position and orientation.
import { math } from "helix";
import { type RigidState } from "./state";
import type { RigidTuning } from "./tuning";

/** Applies gravity and damping, then moves and turns the body by one tick. Run as the body. */
export function integrate(s: RigidState, t: RigidTuning): void {
  const { pos, vel, spin, qw, qv } = s.body;

  vel.y.remove(t.gravity);
  math`${vel} * ${t.damping}`.into(vel);
  math`${spin} * ${t.damping}`.into(spin);
  pos.add(vel);

  // q += ½·(0, ω)·q, written to scratch first since both parts read the old q.
  const nw = s.scalar("q_w", qw.scale);
  const nv = s.vector("q_v", qw.scale);
  math`${qw} - 0.5 * (${spin} · ${qv})`.into(nw);
  math`${qv} + 0.5 * (${qw} * ${spin} + cross(${spin}, ${qv}))`.into(nv);

  // Renormalise every tick, since stored steps drift off unit length.
  const mag = s.scalar("q_mag", qw.scale);
  math`len(${nw}, ${nv.x}, ${nv.y}, ${nv.z})`.into(mag);
  math`${nw} / ${mag}`.into(qw);
  math`${nv} / ${mag}`.into(qv);
}
