// A ray held in scores: where an entity looks from and which way, for math-based hit tests.
import { Path, ScoreTarget, Selector, math } from "helix";
import type { FunctionContext, ScoreVec3 } from "helix";
import type { RaycastState } from "./context";
import { locator } from "../locator";

/** A ray in scores, in blocks: origin, and a direction of length 1. */
export interface Ray {
  readonly origin: ScoreVec3;
  readonly dir: ScoreVec3;
}

/** A {@link Ray} that `fill` points along the executing entity's line of sight. */
export interface LookRay extends Ray {
  /** Writes the executing entity's eye position and look direction into the ray. Run as and at it. */
  fill(ctx: FunctionContext): void;
}

const DEG = Math.PI / 180;

/** Builds the pack's look ray on the `raycast.work` objective. */
export function createLookRay(s: RaycastState): LookRay {
  const origin = s.vector("look_o").scaled(1000);
  const dir = s.vector("look_d").scaled(1000);
  const [yaw, pitch] = ["yaw", "pitch"].map((n) => s.work.score(ScoreTarget(`#look_${n}`)).scaled(1000));
  const loc = locator(s.dp);
  return {
    origin,
    dir,
    fill(ctx) {
      // Eye height changes with sneaking and swimming, so the locator finds it.
      loc.ensure(ctx);
      loc.toEyes(ctx);
      loc.read(ctx, origin);
      [yaw, pitch].forEach((angle, i) =>
        ctx.execute().storeResultScore(angle).run((b) => b.entity(Selector.self()).get(Path.Entity.Rotation.index(i), angle.scale)),
      );
      math`vec(-sin(${yaw} * ${DEG}) * cos(${pitch} * ${DEG}), -sin(${pitch} * ${DEG}), cos(${yaw} * ${DEG}) * cos(${pitch} * ${DEG}))`.into(dir, ctx);
    },
  };
}
