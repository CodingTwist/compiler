import { Component, Path, TellrawText, text } from "helix";
import type { FunctionContext, TellrawPart } from "helix";
import type {
  GrappleSelectors,
  Scratch,
  StateRepository,
  SwingScratch,
} from "./state";

interface DebugDeps {
  scratch: Scratch;
  selectors: GrappleSelectors;
  repo: StateRepository;
}

/** Optional swing readouts, gated by the `DEBUG`/`LOG` flags. Read-only. */
export function createDebugService(d: DebugDeps) {
  /** Reads the player's yaw and pitch (×100) into work scores. Run as the player. */
  function readFacing(ctx: FunctionContext) {
    const yaw = d.scratch.scalar("face_yaw");
    const pitch = d.scratch.scalar("face_pitch");
    ctx
      .execute()
      .storeResultScore(yaw)
      .run((b) =>
        b.entity(d.selectors.self()).get(Path.Entity.Rotation.index(0), 100),
      );
    ctx
      .execute()
      .storeResultScore(pitch)
      .run((b) =>
        b.entity(d.selectors.self()).get(Path.Entity.Rotation.index(1), 100),
      );
    return { yaw, pitch };
  }

  return {
    /**
     * Action-bar readout of dist², rope² and dot.
     * The rope is taut when dist² ≥ rope²; if dist² never gets there, you're free-falling.
     */
    readout(scratch: SwingScratch, ctx: FunctionContext): void {
      const { yaw, pitch } = readFacing(ctx);
      const toPart = (p: string | TellrawPart): TellrawPart =>
        typeof p === "string" ? text(p) : p;
      ctx.title().actionbar(
        d.selectors.self(),
        Component(
          new TellrawText(
            [
              "grapple  dist²=",
              scratch.distSq,
              "  rope²=",
              d.repo.ropeLenSqOf(),
              "  dot=",
              scratch.dot,
              "  facing=",
              yaw,
              "/",
              pitch,
            ].map(toPart),
          ),
        ),
      );
    },

    /**
     * Logs the full swing state to chat each tick, so it lands in `logs/latest.log` for
     * analysis.
     *
     * Positions and velocity are in decimetres; dist², rope² and dot in scale².
     * `#log_frame` orders
     * lines within a second, since log timestamps are per second.
     */
    log(scratch: SwingScratch, ctx: FunctionContext): void {
      const frame = d.scratch.scalar("log_frame");
      frame.add(1);
      const { yaw, pitch } = readFacing(ctx);
      ctx.tellraw(d.selectors.self(), [
        "[g] f=",
        frame,
        " pos=",
        scratch.pos.x,
        " ",
        scratch.pos.y,
        " ",
        scratch.pos.z,
        " vel=",
        scratch.velocity.x,
        " ",
        scratch.velocity.y,
        " ",
        scratch.velocity.z,
        " facing=",
        yaw,
        " ",
        pitch,
        " d2=",
        scratch.distSq,
        " r2=",
        d.repo.ropeLenSq.score(d.selectors.self()),
        " dot=",
        scratch.dot,
      ]);
    },
  };
}

/** The debug readout service - whatever {@link createDebugService} returns. */
export type DebugService = ReturnType<typeof createDebugService>;
