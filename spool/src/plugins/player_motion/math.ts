import { Pos, NbtPath, Id, Range } from "helix";
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
    ctx
      .storage(temp)
      .set(NbtPath("vec_i"), ctx.entity(self()).at(NbtPath("Pos")));
    ctx.teleport(self(), Pos.local(0, 1, 0));
    ctx
      .storage(temp)
      .set(NbtPath("vec_j"), ctx.entity(self()).at(NbtPath("Pos")));
    ctx.teleport(self(), Pos.local(0, 0, 1));
    ctx
      .storage(temp)
      .set(NbtPath("vec_k"), ctx.entity(self()).at(NbtPath("Pos")));
    ctx.teleport(self(), Pos.raw("0.0 0.0 0.0"), Pos.raw("0.0 0.0"));
  });

  // --- internal/math/global/convert_to_local (no-tp approximation) ----------
  fConvertToLocal.build((ctx) => {
    const getInto = (dest: typeof workX, path: string) =>
      ctx
        .execute()
        .storeResultScore(dest)
        .run((b) => b.storage(temp).get(NbtPath(path), 100000));

    dummyScore("#_x").assign(workX);
    dummyScore("#_y").assign(workY);
    dummyScore("#_z").assign(workZ);

    getInto(workX, "vec_i[0]");
    getInto(dummyScore("#vec_i.z"), "vec_i[2]");
    getInto(workY, "vec_j[0]");
    getInto(dummyScore("#vec_j.y"), "vec_j[1]");
    getInto(dummyScore("#vec_j.z"), "vec_j[2]");
    getInto(workZ, "vec_k[0]");
    getInto(dummyScore("#vec_k.y"), "vec_k[1]");
    getInto(dummyScore("#vec_k.z"), "vec_k[2]");

    workX.times(dummyScore("#_x"));
    dummyScore("#vec_i.z").times(dummyScore("#_z"));
    workY.times(dummyScore("#_x"));
    dummyScore("#vec_j.y").times(dummyScore("#_y"));
    dummyScore("#vec_j.z").times(dummyScore("#_z"));
    workZ.times(dummyScore("#_x"));
    dummyScore("#vec_k.y").times(dummyScore("#_y"));
    dummyScore("#vec_k.z").times(dummyScore("#_z"));

    workX.plus(dummyScore("#vec_i.z"));
    workY.plus(dummyScore("#vec_j.y"));
    workY.plus(dummyScore("#vec_j.z"));
    workZ.plus(dummyScore("#vec_k.y"));
    workZ.plus(dummyScore("#vec_k.z"));

    workX.divide(constant("#constant.100000"));
    workY.divide(constant("#constant.100000"));
    workZ.divide(constant("#constant.100000"));
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
    .positioned(Pos.raw("0.0 0.0 0.0"))
    .run((b) => b.call(fStoreRefVectors));

  // Combine the vec_k components into one score for the reuse comparison.
  ctx
    .execute()
    .storeResultScore(dummyScore("#vec_k_combined"))
    .run((b) => b.storage(temp).get(NbtPath("vec_k[0]"), 10000));
  ctx
    .execute()
    .storeResultScore(dummyScore("#temp1"))
    .run((b) => b.storage(temp).get(NbtPath("vec_k[1]"), 10000));
  ctx
    .execute()
    .storeResultScore(dummyScore("#temp2"))
    .run((b) => b.storage(temp).get(NbtPath("vec_k[2]"), 10000));
  dummyScore("#vec_k_combined").plus(dummyScore("#temp1"));
  dummyScore("#vec_k_combined").plus(dummyScore("#temp2"));

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
