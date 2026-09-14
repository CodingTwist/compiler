// The cached world-to-local conversion at the end of `launch_global_xyz`.
import { Pos, Id, Range, math } from "helix";
import type { FunctionContext } from "helix";
import type { PlayerMotionInternals } from "./context";
import { VEC } from "./math";

/**
 * Tail of `launch_global_xyz`: reads reference vectors, reuses the cached result if nothing
 * changed, otherwise converts and launches. The large-vector branch returns fail.
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
  prevMethod.score(self()).set(method);

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
