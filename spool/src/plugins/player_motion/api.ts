import { Pos, NbtPath, Range } from "helix";
import type { PlayerMotionInternals } from "./context";
import { globalConversionTail } from "./global-conversion";

/**
 * The public entry points `api/launch_local_xyz` and `api/launch_global_xyz`, reading
 * `$x/$y/$z player_motion.api.launch`. Unsupported macro branches `return fail`.
 */
/** The world-axis vector handed to the conversion, a `{x, y, z}` compound in `temp`. */
const MATRIX = NbtPath("matrix");

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

    ctx.execute().storeResultStorage(temp, MATRIX.child("x"), "double", 1).run((b) => b.scoreGet(workX));
    ctx.execute().storeResultStorage(temp, MATRIX.child("y"), "double", 1).run((b) => b.scoreGet(workY));
    ctx.execute().storeResultStorage(temp, MATRIX.child("z"), "double", 1).run((b) => b.scoreGet(workZ));

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
    dummyScore("#equal_context").set(0);
    ctx
      .execute()
      .positioned(Pos.local(0, 0, 1))
      .rotatedAs(self())
      .positioned(Pos.local(0, 0, -1))
      .ifEntity(self().distance(new Range(undefined, 0.00001)))
      .run((b) => dummyScore("#equal_context").set(1));

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
