// One integration step for the executing body: gravity, damping, position and orientation.
import { math } from "helix";
import { Q, W, type RigidState } from "./state";
import type { RigidTuning } from "./tuning";

/** Applies gravity and damping, then moves and turns the body by one tick. Run as the body. */
export function integrate(s: RigidState, t: RigidTuning): void {
  const { pos, vel, spin, qw, qv } = s.body;
  const damp = t.damping;

  vel.y.remove(t.gravity);
  // Round rather than floor, or small velocities creep toward −1.
  math`(${vel} * ${damp} + 500) / 1000`.into(vel);
  math`(${spin} * ${damp} + 500) / 1000`.into(spin);
  pos.add(vel);

  // dq = ½·(0, ω)·q: w' = −ω·v, v' = w·ω + ω×v. ω is scaled to half-radians first, on the
  // float side, since ω × q overflows an int.
  const half = 0.5 / W;
  const dv = s.vector("dq");
  const dw = s.scalar("dq_w");
  math`-((${spin} * ${half}) · ${qv})`.into(dw);
  math`${qw} * (${spin} * ${half}) + cross(${spin} * ${half}, ${qv})`.into(dv);
  math`${qw} + ${dw}`.into(qw);
  qv.add(dv);

  // Renormalise every tick, since integer steps drift off unit length.
  const mag = s.scalar("q_mag");
  math`len(${qw}, ${qv.x}, ${qv.y}, ${qv.z})`.into(mag);
  math`${qw} * ${Q} / ${mag}`.into(qw);
  math`${qv} * ${Q} / ${mag}`.into(qv);
}
