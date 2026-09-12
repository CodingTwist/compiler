import { Pos, NbtPath, Id, Range, math } from "helix";
import type { FunctionContext } from "helix";
import type { PlayerMotionInternals } from "./context";

/**
 * The global-vector math (pure scoreboard / storage, no macros).
 *
 * The problem: `launch/main` can only push the player along its *local* axes
 * (the impulse enchantment is direction-fixed), but `launch_global_xyz` is given
 * a vector in *world* axes. So we change the vector's basis from world to local
 * before launching. Two steps:
 *
 *   `store_reference_vectors` - find what the player's three local axes point to
 *     in world space. Teleport one unit along each local axis (`^1 ^0 ^0` = left,
 *     `^0 ^1 ^0` = up, `^0 ^0 ^1` = forward) and read the resulting world `Pos`.
 *     Those are the unit vectors i (left), j (up), k (forward). Then teleport back.
 *
 *   `convert_to_local` - project the requested world vector onto i/j/k (a dot
 *     product per axis): the local coordinate along each axis is how much of the
 *     world vector lies along that reference vector. The `*100000` / `/100000`
 *     dance is fixed-point: scoreboards are integer-only, so each fractional
 *     reference-vector component is read scaled up by 100000, multiplied in, then
 *     scaled back down. (Upstream calls this a "no-tp approximation" - it skips a
 *     per-component teleport by doing the projection in arithmetic instead.)
 */
/**
 * The three reference vectors in `temp` storage - each a 3-element list, so an axis
 * is `VEC.i.index(0)` rather than a `"vec_i[0]"` literal.
 */
const VEC = {
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

    // The world vector, saved off because the work slots double as each
    // reference vector's x component below (one slot fewer than reading them
    // into three more).
    const g = { x: dummyScore("#_x"), y: dummyScore("#_y"), z: dummyScore("#_z") };
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

    // local = (g·i, g·j, g·k) / 100000 - the projection, written as itself.
    // `#constant.100000` rather than the literal so the scoreboard backend gets
    // a score operand instead of materialising the number three times.
    const S = constant("#constant.100000");
    math`(${workX} * ${g.x} + ${iZ} * ${g.z}) / ${S}`.into(workX);
    math`(${workY} * ${g.x} + ${jY} * ${g.y} + ${jZ} * ${g.z}) / ${S}`.into(workY);
    math`(${workZ} * ${g.x} + ${kY} * ${g.y} + ${kZ} * ${g.z}) / ${S}`.into(workZ);
  });
}

/**
 * The shared tail of `launch_global_xyz` once `#x/#y/#z` hold the global vector:
 * read the reference vectors via the marker, short-circuit to the cached local
 * vector when inputs + orientation match, otherwise convert and launch. The
 * large-vector branch needs macros and is unsupported in this build, so it
 * early-`return fail`. Lives here (not in api) because it is the bridge into the
 * math functions and shares all their state.
 */
export function globalConversionTail(
  I: PlayerMotionInternals,
  ctx: FunctionContext,
  method: number,
): void {
  const {
    marker,
    temp,
    fStoreRefVectors,
    fConvertToLocal,
    fUsePrevious,
    fLaunchMain,
    self,
    dummyScore,
    prevMethod,
    prevVecK,
    prevXin,
    prevYin,
    prevZin,
    prevX,
    prevY,
    prevZ,
    inputX,
    inputY,
    inputZ,
    workX,
    workY,
    workZ,
    largeGlobal,
  } = I;

  // Magnitude-1 reference vectors (left/up/forward) via the dummy marker.
  ctx
    .execute()
    .as(marker())
    .in(Id("minecraft:overworld"))
    .positioned(Pos.exact(0, 0, 0))
    .run((b) => b.call(fStoreRefVectors));

  // Combine the vec_k components into one score for the reuse comparison.
  ctx
    .execute()
    .storeResultScore(dummyScore("#vec_k_combined"))
    .run((b) => b.storage(temp).get(VEC.k.index(0), 10000));
  ctx
    .execute()
    .storeResultScore(dummyScore("#temp1"))
    .run((b) => b.storage(temp).get(VEC.k.index(1), 10000));
  ctx
    .execute()
    .storeResultScore(dummyScore("#temp2"))
    .run((b) => b.storage(temp).get(VEC.k.index(2), 10000));
  const kCombined = dummyScore("#vec_k_combined");
  math`${kCombined} + ${dummyScore("#temp1")} + ${dummyScore("#temp2")}`.into(
    kCombined,
    ctx,
  );

  // Reuse the previous local vector if the inputs and orientation match.
  ctx
    .execute()
    .ifScoreMatches(prevMethod.score(self()), new Range(method, method))
    .ifScore(prevVecK.score(self()), "=", dummyScore("#vec_k_combined"))
    .ifScore(prevXin.score(self()), "=", inputX)
    .ifScore(prevYin.score(self()), "=", inputY)
    .ifScore(prevZin.score(self()), "=", inputZ)
    .run((b) => b.returnRun((r) => r.call(fUsePrevious)));

  prevVecK.score(self()).assign(dummyScore("#vec_k_combined"));
  ctx.scoreSet(prevMethod.score(self()).set(method));

  // Large-vector conversion needs macros; unsupported in this build.
  ctx
    .execute()
    .ifPredicate(largeGlobal)
    .run((b) => b.return_().fail());
  ctx.call(fConvertToLocal);

  prevXin.score(self()).assign(inputX);
  prevYin.score(self()).assign(inputY);
  prevZin.score(self()).assign(inputZ);
  prevX.score(self()).assign(workX);
  prevY.score(self()).assign(workY);
  prevZ.score(self()).assign(workZ);

  ctx.returnRun((r) => r.call(fLaunchMain));
}
