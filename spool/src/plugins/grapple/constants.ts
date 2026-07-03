import { Objective, ScoreTarget } from "helix";
import {
  FRAC_SCALE,
  MAX_IMPULSE,
  BAUMGARTE_DIV,
  BAUMGARTE_MAX,
  SUSTAIN_DIV,
  RADIAL_DAMP_DIV,
  RELEASE_KICK,
  RELEASE_KICK_MAX,
} from "./tuning";

/** A bound scoreboard slot - what `Objective.score(...)` yields. */
type Score = ReturnType<Objective["score"]>;

/**
 * The load-time **constants** the pendulum math multiplies by: the `#…` slots on
 * `grapple.const`, plus the {@link seeds} table `grapple/init` writes them from (each
 * `[slot, value]` sourced from `tuning.ts`). The one place a tuning knob becomes a live
 * score. `nextId` is deliberately **not** in `seeds` - it's a persistent counter seeded
 * once, conditionally, by init (never clobbered on reload).
 */
export function createConstants() {
  const objective = new Objective("grapple.const");
  const score = (name: string): Score => objective.score(ScoreTarget(`#${name}`));

  const negOne = score("neg_one");
  const fracScale = score("frac_scale");
  const nextId = score("next_id");
  const baumDiv = score("baum_div");
  const baumMax = score("baum_max");
  const sustainDiv = score("sustain_div");
  const radialDampDiv = score("radial_damp_div");
  const releaseKick = score("release_kick");
  const releaseKickMax = score("release_kick_max");
  const impulseMax = score("impulse_max");
  const impulseMin = score("impulse_min");

  // Seed order is the order `grapple/init` emits (kept stable so the rendered init is
  // predictable). `nextId` is omitted - init seeds it conditionally, not in this loop.
  const seeds: readonly [Score, number][] = [
    [negOne, -1],
    [fracScale, FRAC_SCALE],
    [baumDiv, BAUMGARTE_DIV],
    [baumMax, BAUMGARTE_MAX],
    [sustainDiv, SUSTAIN_DIV],
    [radialDampDiv, RADIAL_DAMP_DIV],
    [releaseKick, RELEASE_KICK],
    [releaseKickMax, RELEASE_KICK_MAX],
    [impulseMax, MAX_IMPULSE],
    [impulseMin, -MAX_IMPULSE],
  ];

  return {
    objective,
    seeds,
    negOne, fracScale, nextId, baumDiv, baumMax, sustainDiv,
    radialDampDiv, releaseKick, releaseKickMax, impulseMax, impulseMin,
  };
}

/** The load-time constants table - whatever {@link createConstants} returns. */
export type Constants = ReturnType<typeof createConstants>;
