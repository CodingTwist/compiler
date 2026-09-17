import { Item, Enchantment, Range, math } from "helix";
import type { PlayerMotionInternals } from "./context";

/**
 * Launch functions: `main` (apply the saddle and trigger with a gamemode swap), `reset`,
 * `use_previous` (replay a cached vector) and `handle_polar/global` (straight-up case).
 */
export function defineLaunch(I: PlayerMotionInternals): void {
  const {
    ns,
    self,
    fLaunchMain,
    fReset,
    fUsePrevious,
    fPolarGlobal,
    fStoreX,
    fStoreY,
    fStoreZ,
    gamemodeScore,
    dummyScore,
    work,
    sustain,
    prevLocal,
    fallingCreative,
  } = I;

  // --- launch/main -------------------------------------------------
  fLaunchMain.build((ctx) => {
    // Apply the dummy saddle carrying the apply_impulse enchantment.
    const saddle = Item.SADDLE.component(
      "equippable",
      '{slot: "saddle", equip_sound: "intentionally_empty"}',
    ).enchant(Enchantment(`${ns}:internal/apply_impulse`), 1);
    ctx.item().replaceEntityWith(self(), "saddle", saddle);

    ctx.call(fStoreX);
    ctx.call(fStoreY);
    ctx.call(fStoreZ);

    // Sustained callers skip the gamemode swap. `return run` clears the flag and returns in
    // one command.
    ctx
      .execute()
      .ifScoreMatches(sustain, new Range(1, 1))
      .run((b) => b.returnRun((r) => sustain.set(0)));

    // Trigger location_changed by a gamemode swap, then restore the gamemode.
    ctx
      .execute()
      .ifEntity(self().gamemode("survival"))
      .run((b) => gamemodeScore("#mode").set(2));
    ctx
      .execute()
      .ifEntity(self().gamemode("adventure"))
      .run((b) => gamemodeScore("#mode").set(3));
    ctx
      .execute()
      .ifScoreMatches(gamemodeScore("#mode"), new Range(2, 3))
      .run((b) => b.gamemode("spectator"));
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
    ctx
      .execute()
      .ifScoreMatches(gamemodeScore("#falling"), new Range(0, 0))
      .run((b) => b.gamemode("spectator"));

    ctx.returnRun((r) => r.gamemode("creative"));
  });

  // --- launch/reset ------------------------------------------------
  fReset.build((ctx) => {
    ctx.item().replaceEntityWith(self(), "saddle", Item.AIR);
  });

  // --- launch/use_previous (reuse cached local vector) -------------
  fUsePrevious.build((ctx) => {
    work.assign(prevLocal);
    ctx.returnRun((r) => r.call(fLaunchMain));
  });

  // --- launch/handle_polar/global (pure scoreboard) ----------------
  fPolarGlobal.build((ctx) => {
    ctx
      .execute()
      .ifScoreMatches(work.x, new Range(0, 0))
      .ifScoreMatches(work.y, new Range(0, 0))
      .run((b) => b.returnRun((r) => r.call(fLaunchMain)));
    work.y.swap(work.z);
    // Stored on its own chain: a multi-command negation runs as a function, whose success
    // `store success` can't rely on.
    const within90 = dummyScore("#y_abs_within_90");
    ctx
      .execute()
      .storeSuccessScore(within90)
      .ifEntity(self().yRotation(new Range(90, -90)))
      .done();
    ctx
      .execute()
      .ifScoreMatches(within90, new Range(1, 1))
      .run(() => math`-${work.x}`.into(work.x));
    ctx
      .execute()
      .ifScoreMatches(within90, new Range(0, 0))
      .run(() => math`-${work.y}`.into(work.y));
    ctx.returnRun((r) => r.call(fLaunchMain));
  });
}
