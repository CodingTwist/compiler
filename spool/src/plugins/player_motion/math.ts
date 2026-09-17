// The two math functions player_motion emits: store reference vectors and convert to local axes.
import { Pos, NbtPath, ScoreVec3 } from "helix";
import type { PlayerMotionInternals } from "./context";

/**
 * Converts a world-axis vector to the player's local axes, since the impulse only pushes
 * along local axes.
 *
 * `store_reference_vectors`: teleport one unit along each local axis and read the world
 * position, giving vectors i (left), j (up), k (forward).
 *
 * `convert_to_local`: dot the world vector with i, j and k. Reference vectors are scaled by
 * 100000 because scores are integers.
 */
/** The three reference vectors in `temp` storage. */
export const VEC = {
  i: NbtPath("vec_i"),
  j: NbtPath("vec_j"),
  k: NbtPath("vec_k"),
} as const;

/** The entity position the reference vectors are read off. */
const POS = NbtPath("Pos");

export function defineMath(I: PlayerMotionInternals): void {
  const { self, temp, fStoreRefVectors, fConvertToLocal, work, dummyScore } = I;

  // --- math/global/store_reference_vectors -------------------------
  fStoreRefVectors.build((ctx) => {
    ctx.teleport(self(), Pos.local(1, 0, 0));
    ctx.storage(temp).set(VEC.i, ctx.entity(self()).at(POS));
    ctx.teleport(self(), Pos.local(0, 1, 0));
    ctx.storage(temp).set(VEC.j, ctx.entity(self()).at(POS));
    ctx.teleport(self(), Pos.local(0, 0, 1));
    ctx.storage(temp).set(VEC.k, ctx.entity(self()).at(POS));
    ctx.teleport(self(), Pos.exact(0, 0, 0), Pos.exact(0, 0));
  });

  // --- math/global/convert_to_local (no-tp approximation) ----------
  fConvertToLocal.build((ctx) => {
    // Save the world vector, because the work slots receive the result.
    const g = ScoreVec3.from((axis) => dummyScore(`#_${axis}`)).assign(work);
    const ref = (name: keyof typeof VEC) =>
      ScoreVec3.from((axis) => dummyScore(`#vec_${name}.${axis}`)).readStorage(
        temp,
        VEC[name],
        100000,
      );

    // local = (g·i, g·j, g·k) / 100000
    ref("i").dot(g, work.x);
    ref("j").dot(g, work.y);
    ref("k").dot(g, work.z);
    work.divide(100000);
  });
}
