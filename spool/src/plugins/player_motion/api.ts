import { Pos, NbtPath, Range } from "helix";
import type { PlayerMotionInternals } from "./context";
import { globalConversionTail } from "./math";

/**
 * The public entry points: `api/launch_local_xyz` (launch relative to the
 * rotation context) and `api/launch_global_xyz` (launch along world axes). Both
 * take their input from the `$x/$y/$z player_motion.api.launch` scores. The
 * macro-bound branches (mismatched-context / polar-local rotation, large-vector
 * conversion) are unsupported in this build and `return fail` so a caller gets a
 * clear signal instead of silently-wrong motion.
 */
export function defineApi(I: PlayerMotionInternals): void {
  const {
    self, temp, fLaunchMain, fPolarGlobal, dummyScore, inputX, inputY, inputZ, workX, workY, workZ,
    fLaunchLocal, fLaunchGlobal,
  } = I;

  // --- api/launch_global_xyz ------------------------------------------------
  fLaunchGlobal.build((ctx) => {
    ctx
      .execute()
      .ifScoreMatches(inputX, new Range(0, 0))
      .ifScoreMatches(inputY, new Range(0, 0))
      .ifScoreMatches(inputZ, new Range(0, 0))
      .run((b) => b.return_(0));

    workX.assign(inputX);
    workY.assign(inputY);
    workZ.assign(inputZ);

    // Looking straight up is a degenerate rotation - handle with the polar path.
    ctx
      .execute()
      .ifEntity(self().xRotation(new Range(-90, -90)))
      .run((b) => b.returnRun((r) => r.call(fPolarGlobal)));

    ctx.execute().storeResultStorage(temp, NbtPath("matrix.x"), "double", 1).run((b) => b.scoreGet(workX));
    ctx.execute().storeResultStorage(temp, NbtPath("matrix.y"), "double", 1).run((b) => b.scoreGet(workY));
    ctx.execute().storeResultStorage(temp, NbtPath("matrix.z"), "double", 1).run((b) => b.scoreGet(workZ));

    globalConversionTail(I, ctx, 0);
  });

  // --- api/launch_local_xyz -------------------------------------------------
  fLaunchLocal.build((ctx) => {
    ctx
      .execute()
      .ifScoreMatches(inputX, new Range(0, 0))
      .ifScoreMatches(inputY, new Range(0, 0))
      .ifScoreMatches(inputZ, new Range(0, 0))
      .run((b) => b.return_(0));

    workX.assign(inputX);
    workY.assign(inputY);
    workZ.assign(inputZ);

    // Detect whether the viewport angle equals the position/rotation context.
    ctx.scoreSet(dummyScore("#equal_context").set(0));
    ctx
      .execute()
      .positioned(Pos.local(0, 0, 1))
      .rotatedAs(self())
      .positioned(Pos.local(0, 0, -1))
      .ifEntity(self().distance(new Range(undefined, 0.00001)))
      .run((b) => b.scoreSet(dummyScore("#equal_context").set(1)));

    // Common fast path: context matches and not looking straight up - launch directly.
    ctx
      .execute()
      .ifScoreMatches(dummyScore("#equal_context"), new Range(1, 1))
      .unlessEntity(self().xRotation(new Range(-90, -90)))
      .run((b) => b.returnRun((r) => r.call(fLaunchMain)));

    // Polar-local and mismatched-context rotation both need macros: unsupported here.
    ctx.return_().fail();
  });
}
