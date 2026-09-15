// Draws the executing body: position and orientation onto its item_display.
import { Byte, Double, Float, Nbt, NbtPath, and, math } from "helix";
import type { FunctionContext } from "helix";
import { MM, Q, type RigidState } from "./state";

const FRAME = NbtPath("frame");

/** The render buffer's initial value, written once at load so the stores keep their types. */
export const RENDER_INIT = Nbt({
  probe: [Double(0), Double(0), Double(0)],
  frame: {
    Pos: [Double(0), Double(0), Double(0)],
    transformation: { left_rotation: [Float(0), Float(0), Float(0), Float(1)] },
    start_interpolation: Byte(0),
  },
});

/** Writes this tick's pose into storage, then merges it into the body in one entity write. */
export function render(s: RigidState, ctx: FunctionContext): void {
  const { pos, qv, qw } = s.body;
  pos.components.forEach((score, axis) =>
    ctx
      .execute()
      .storeResultStorage(s.render, NbtPath(`frame.Pos[${axis}]`), "double", 1 / MM)
      .run((c) => score.get(c)),
  );
  // `left_rotation` is [x, y, z, w].
  [...qv.components, qw].forEach((score, axis) =>
    ctx
      .execute()
      .storeResultStorage(
        s.render,
        NbtPath(`frame.transformation.left_rotation[${axis}]`),
        "float",
        1 / Q,
      )
      .run((c) => score.get(c)),
  );
  ctx.entity(s.self()).merge(NbtPath("{}"), ctx.storage(s.render).at(FRAME));
}

/**
 * Decays the recent-motion sum and puts the body to sleep once it has settled.
 * Needs three touching corners too, or a cube balanced on an edge freezes mid-fall.
 */
export function checkSleep(s: RigidState, sleepBelow: number, ctx: FunctionContext): void {
  const { motion, vel, spin, sleeping } = s.body;
  math`(${motion} * 9 + len2(${vel}) + len2(${spin} / 100)) / 10`.into(motion);
  ctx.if(and(motion.lessThan(sleepBelow), s.scalar("hits").atLeast(3)), () => {
    sleeping.set(1);
    vel.components.forEach((c) => c.set(0));
    spin.components.forEach((c) => c.set(0));
  });
}
