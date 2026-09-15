// The two math functions player_motion emits: store reference vectors and convert to local axes.
import { Pos, NbtPath, math } from "helix";
import type { PlayerMotionInternals } from "./context";

/**
 * Converts a world-axis vector to the player's local axes, since the impulse only pushes
 * along local axes.
 *
 * `store_reference_vectors`: teleport one unit along each local axis and read the world
 * position, giving vectors i (left), j (up), k (forward).
 *
 * `convert_to_local`: dot the world vector with i, j and k. Values are scaled by 100000
 * because
 * scores are integers.
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
  const {
    self,
    temp,
    fStoreRefVectors,
    fConvertToLocal,
    workX,
    workY,
    workZ,
    dummyScore,
    constant,
  } = I;

  // --- internal/math/global/store_reference_vectors -------------------------
  fStoreRefVectors.build((ctx) => {
    ctx.teleport(self(), Pos.local(1, 0, 0));
    ctx.storage(temp).set(VEC.i, ctx.entity(self()).at(POS));
    ctx.teleport(self(), Pos.local(0, 1, 0));
    ctx.storage(temp).set(VEC.j, ctx.entity(self()).at(POS));
    ctx.teleport(self(), Pos.local(0, 0, 1));
    ctx.storage(temp).set(VEC.k, ctx.entity(self()).at(POS));
    ctx.teleport(self(), Pos.exact(0, 0, 0), Pos.exact(0, 0));
  });

  // --- internal/math/global/convert_to_local (no-tp approximation) ----------
  fConvertToLocal.build((ctx) => {
    const getInto = (dest: typeof workX, path: NbtPath) =>
      ctx
        .execute()
        .storeResultScore(dest)
        .run((b) => b.storage(temp).get(path, 100000));

    // Save the world vector, because the work slots are reused for the reference vectors
    // below.
    const g = {
      x: dummyScore("#_x"),
      y: dummyScore("#_y"),
      z: dummyScore("#_z"),
    };
    g.x.assign(workX);
    g.y.assign(workY);
    g.z.assign(workZ);

    // Only the components that can be non-zero: i (left) is horizontal, so no y.
    const iZ = dummyScore("#vec_i.z");
    const jY = dummyScore("#vec_j.y");
    const jZ = dummyScore("#vec_j.z");
    const kY = dummyScore("#vec_k.y");
    const kZ = dummyScore("#vec_k.z");
    getInto(workX, VEC.i.index(0));
    getInto(iZ, VEC.i.index(2));
    getInto(workY, VEC.j.index(0));
    getInto(jY, VEC.j.index(1));
    getInto(jZ, VEC.j.index(2));
    getInto(workZ, VEC.k.index(0));
    getInto(kY, VEC.k.index(1));
    getInto(kZ, VEC.k.index(2));

    // local = (g·i, g·j, g·k) / 100000
    const S = constant("#constant.100000");
    math`(${workX} * ${g.x} + ${iZ} * ${g.z}) / ${S}`.into(workX);
    math`(${workY} * ${g.x} + ${jY} * ${g.y} + ${jZ} * ${g.z}) / ${S}`.into(
      workY,
    );
    math`(${workZ} * ${g.x} + ${kY} * ${g.y} + ${kZ} * ${g.z}) / ${S}`.into(
      workZ,
    );
  });
}
