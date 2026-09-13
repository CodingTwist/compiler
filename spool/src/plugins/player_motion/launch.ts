import { Item, Id, Range, math } from "helix";
import type { PlayerMotionInternals } from "./context";

/**
 * The launch primitives that actually move the player: `internal/launch/main`
 * (apply the enchanted saddle, decompose the vector, and trigger
 * `location_changed` via a gamemode swap), `internal/launch/reset` (strip the
 * saddle the enchantment leaves), `internal/launch/use_previous` (replay a
 * cached local vector), and `internal/launch/handle_polar/global` (the
 * straight-up degenerate-rotation case, pure scoreboard).
 */
export function defineLaunch(I: PlayerMotionInternals): void {
  const {
    ns, self, fLaunchMain, fReset, fUsePrevious, fPolarGlobal, fStoreX, fStoreY, fStoreZ,
    gamemodeScore, dummyScore, constant, workX, workY, workZ, sustain, prevX, prevY, prevZ,
    fallingCreative,
  } = I;

  // --- internal/launch/main -------------------------------------------------
  fLaunchMain.build((ctx) => {
    // Apply the dummy saddle carrying the apply_impulse enchantment.
    const saddle = Item.SADDLE
      .component("equippable", '{slot: "saddle", equip_sound: "intentionally_empty"}')
      .enchant(Id(`${ns}:internal/apply_impulse`), 1);
    ctx.item().replaceEntityWith(self(), "saddle", saddle);

    ctx.call(fStoreX);
    ctx.call(fStoreY);
    ctx.call(fStoreZ);

    // Sustained (per-tick) callers rely on the player's own movement to fire the
    // enchantment's location_changed, so they skip the gamemode-swap trigger below.
    // `return run` both clears the one-shot flag (so it never leaks into the next
    // launch) and returns - one inlined command, no child function.
    ctx
      .execute()
      .ifScoreMatches(sustain, new Range(1, 1))
      .run((b) => b.returnRun((r) => sustain.set(0)));

    // Trigger location_changed by a gamemode swap, then restore the gamemode.
    ctx.execute().ifEntity(self().gamemode("survival")).run((b) => gamemodeScore("#mode").set(2));
    ctx.execute().ifEntity(self().gamemode("adventure")).run((b) => gamemodeScore("#mode").set(3));
    ctx.execute().ifScoreMatches(gamemodeScore("#mode"), new Range(2, 3)).run((b) => b.gamemode("spectator"));
    ctx
      .execute()
      .ifScoreMatches(gamemodeScore("#mode"), new Range(2, 2))
      .storeSuccessScore(gamemodeScore("#mode"))
      .run((b) => b.returnRun((r) => r.gamemode("survival")));
    ctx
      .execute()
      .ifScoreMatches(gamemodeScore("#mode"), new Range(3, 3))
      .storeSuccessScore(gamemodeScore("#mode"))
      .run((b) => b.returnRun((r) => r.gamemode("adventure")));

    // Creative players: pick spectator or (when falling) adventure for the swap.
    gamemodeScore("#falling").set(0);
    ctx
      .execute()
      .ifPredicate(fallingCreative)
      .storeSuccessScore(gamemodeScore("#falling"))
      .run((b) => b.gamemode("adventure"));
    ctx.execute().ifScoreMatches(gamemodeScore("#falling"), new Range(0, 0)).run((b) => b.gamemode("spectator"));

    ctx.returnRun((r) => r.gamemode("creative"));
  });

  // --- internal/launch/reset ------------------------------------------------
  fReset.build((ctx) => {
    ctx.item().replaceEntityWith(self(), "saddle", Item.AIR);
  });

  // --- internal/launch/use_previous (reuse cached local vector) -------------
  fUsePrevious.build((ctx) => {
    workX.assign(prevX.score(self()));
    workY.assign(prevY.score(self()));
    workZ.assign(prevZ.score(self()));
    ctx.returnRun((r) => r.call(fLaunchMain));
  });

  // --- internal/launch/handle_polar/global (pure scoreboard) ----------------
  fPolarGlobal.build((ctx) => {
    ctx
      .execute()
      .ifScoreMatches(workX, new Range(0, 0))
      .ifScoreMatches(workY, new Range(0, 0))
      .run((b) => b.returnRun((r) => r.call(fLaunchMain)));
    workY.swap(workZ);
    dummyScore("#y_abs_within_90").set(0);
    ctx
      .execute()
      .ifEntity(self().yRotation(new Range(90, -90)))
      .storeSuccessScore(dummyScore("#y_abs_within_90"))
      .run(() => math`${workX} * ${constant("#constant.-1")}`.into(workX));
    ctx
      .execute()
      .ifScoreMatches(dummyScore("#y_abs_within_90"), new Range(0, 0))
      .run(() => math`${workY} * ${constant("#constant.-1")}`.into(workY));
    ctx.returnRun((r) => r.call(fLaunchMain));
  });
}
