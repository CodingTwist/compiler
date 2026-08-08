import { Component, NbtPath } from "helix";
import type { FunctionContext } from "helix";
import type { GrappleSelectors, Scratch, StateRepository, SwingScratch } from "./state";

interface DebugDeps {
  scratch: Scratch;
  selectors: GrappleSelectors;
  repo: StateRepository;
}

/**
 * The **debug service**: the optional live readouts of the swing state, gated by the
 * `DEBUG`/`LOG` tuning flags in the swing tick. Read-only - it only samples state and
 * prints it, never touches the physics. Two views: an in-place action bar and a
 * per-tick chat line that lands in `logs/latest.log` for offline trajectory analysis.
 */
export function createDebugService(d: DebugDeps) {
  /**
   * Read the player's look angles into two work scores (fixed-point ×100): `yaw =
   * Rotation[0]` (−180…180, 0 = +Z/south, ±180 = −Z), `pitch = Rotation[1]` (−90 up …
   * +90 down). Same `store result … run data get` pattern as `repo.readPos`. Lets a
   * debug line show *where the player is looking* - the axis the release kick flings
   * along. Runs as the grappling player (`@s`).
   */
  function readFacing(ctx: FunctionContext) {
    const yaw = d.scratch.scalar("face_yaw");
    const pitch = d.scratch.scalar("face_pitch");
    ctx.execute().storeResultScore(yaw).run((b) => b.entity(d.selectors.self()).get(NbtPath("Rotation[0]"), 100));
    ctx.execute().storeResultScore(pitch).run((b) => b.entity(d.selectors.self()).get(NbtPath("Rotation[1]"), 100));
    return { yaw, pitch };
  }

  return {
    /**
     * Live action-bar (overwrites in place, no chat spam): the three numbers the pendulum
     * turns on. Taut requires dist² ≥ rope²; the constraint also needs dot < 0 (moving
     * outward). If dist² never reaches rope², the rope is never taut and you free-fall. Raw
     * score component (score parts aren't expressible through the typed `Component` yet).
     */
    readout(scratch: SwingScratch, ctx: FunctionContext): void {
      const v = ctx.version;
      const { yaw, pitch } = readFacing(ctx);
      ctx.title().actionbar(
        d.selectors.self(),
        Component([
          "grapple  dist²=",
          { score: { name: scratch.distSq.target.render(v), objective: scratch.distSq.objective.getName() } },
          "  rope²=",
          { score: { name: "@s", objective: d.repo.ropeLenSq.getName() } },
          "  dot=",
          { score: { name: scratch.dot.target.render(v), objective: scratch.dot.objective.getName() } },
          "  facing=",
          { score: { name: yaw.target.render(v), objective: yaw.objective.getName() } },
          "/",
          { score: { name: pitch.target.render(v), objective: pitch.objective.getName() } },
        ]),
      );
    },

    /**
     * Per-tick **chat** line (one per grappling player per tick) of the full swing state, so
     * the trajectory lands in the client's `logs/latest.log` (chat is logged) and can be read
     * back offline to see exactly where a swing misbehaves.
     *
     * All scores are the raw integers the math runs on: positions/velocity in **decimetres**
     * (÷10 = blocks), `dist²`/`rope²`/`dot` in **scale²** (÷100). A monotonic `#log_frame`
     * counter (incremented here) orders samples *within* a log second, since the log timestamp
     * is only second-resolution.
     */
    log(scratch: SwingScratch, ctx: FunctionContext): void {
      const frame = d.scratch.scalar("log_frame");
      ctx.scoreAdd(frame.add(1));
      const { yaw, pitch } = readFacing(ctx);
      ctx.tellraw(d.selectors.self(), [
        "[g] f=", frame,
        " pos=", scratch.pos.x, " ", scratch.pos.y, " ", scratch.pos.z,
        " vel=", scratch.velocity.x, " ", scratch.velocity.y, " ", scratch.velocity.z,
        " facing=", yaw, " ", pitch,
        " d2=", scratch.distSq,
        " r2=", d.repo.ropeLenSq.score(d.selectors.self()),
        " dot=", scratch.dot,
      ]);
    },
  };
}

/** The debug readout service - whatever {@link createDebugService} returns. */
export type DebugService = ReturnType<typeof createDebugService>;
