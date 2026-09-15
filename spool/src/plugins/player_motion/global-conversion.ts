// The cached world-to-local conversion at the end of `launch_global_xyz`.
import { Pos, Id, Range, ScoreVec3, math } from "helix";
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
    prevInput,
    prevLocal,
    input,
    work,
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
  const k = ScoreVec3.from((axis) => dummyScore(`#vec_k.${axis}`)).readStorage(
    temp,
    VEC.k,
    10000,
    { ctx },
  );
  const kCombined = dummyScore("#vec_k_combined");
  math`${k.x} + ${k.y} + ${k.z}`.into(kCombined, ctx);

  // Reuse the previous local vector if the inputs and orientation match.
  ctx
    .execute()
    .ifScoreMatches(prevMethod.score(self()), new Range(method, method))
    .ifScore(prevVecK.score(self()), "=", dummyScore("#vec_k_combined"))
    .ifScore(prevInput.x, "=", input.x)
    .ifScore(prevInput.y, "=", input.y)
    .ifScore(prevInput.z, "=", input.z)
    .run((b) => b.returnRun((r) => r.call(fUsePrevious)));

  prevVecK.score(self()).assign(dummyScore("#vec_k_combined"));
  prevMethod.score(self()).set(method);

  // Large-vector conversion needs macros; unsupported in this build.
  ctx
    .execute()
    .ifPredicate(largeGlobal)
    .run((b) => b.return_().fail());
  ctx.call(fConvertToLocal);

  prevInput.assign(input);
  prevLocal.assign(work);

  ctx.returnRun((r) => r.call(fLaunchMain));
}
