// Load-time constants on `grapple.const`, seeded from `tuning.ts`.
import { Objective, ScoreTarget } from "helix";
import {
  BAUMGARTE_DIV,
  BAUMGARTE_MAX,
  FRAC_SCALE,
  MAX_IMPULSE,
  RADIAL_DAMP_DIV,
  RELEASE_KICK,
  RELEASE_KICK_MAX,
  SUSTAIN_DIV,
} from "../tuning";

/** A bound scoreboard slot - what `Objective.score(...)` yields. */
type Score = ReturnType<Objective["score"]>;

/**
 * Load-time constants on `grapple.const`, seeded by `grapple/init` from `tuning.ts`.
 * `nextId` isn't in `seeds`: it's a persistent counter seeded once.
 */
export function createConstants() {
  const objective = new Objective("grapple.const");
  const score = (name: string): Score => objective.score(ScoreTarget(`#${name}`));

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

  // Kept in a stable order so init output is predictable. `nextId` is seeded separately.
  const seeds: readonly [Score, number][] = [
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
    fracScale, nextId, baumDiv, baumMax, sustainDiv,
    radialDampDiv, releaseKick, releaseKickMax, impulseMax, impulseMin,
  };
}

/** The load-time constants table - whatever {@link createConstants} returns. */
export type Constants = ReturnType<typeof createConstants>;
