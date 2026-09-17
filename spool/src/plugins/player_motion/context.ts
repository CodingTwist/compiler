import { Objective, ScoreTarget, ScoreVec3, Selector, Id } from "helix";
import type { Datapack } from "helix";
import {
  MARKER_UUID,
  enchantmentJson,
  largeGlobal as largeGlobalDef,
  fallingCreative as fallingCreativeDef,
} from "./resources";

/**
 * Shared objectives, scores, selectors, predicates and function refs for the
 * `player_motion` builders.
 *
 * Objective names stay `player_motion.*` because the enchantment JSON uses them. Functions
 * are created up front so bodies can call each other.
 */
export function createInternals(dp: Datapack) {
  const ns = dp.name;
  const self = () => Selector.self();
  const marker = () => Selector.uuid(MARKER_UUID);
  const temp = Id(`${ns}:internal/temp`);

  // --- Objectives (kept under their global `player_motion.*` names) ----------
  const api = new Objective("player_motion.api.launch");
  const dummy = new Objective("player_motion.internal.dummy");
  const math = new Objective("player_motion.internal.math");
  const gm = new Objective("player_motion.internal.gamemode");
  const store = new Objective("player_motion.internal.store");
  const prevVecK = new Objective("player_motion.internal.previous_vec_k");
  const prevIn = ["x", "y", "z"].map(
    (a) => new Objective(`player_motion.internal.previous_${a}.in`),
  );
  const prevOut = ["x", "y", "z"].map(
    (a) => new Objective(`player_motion.internal.previous_${a}`),
  );
  const prevMethod = new Objective("player_motion.internal.previous_method");

  // Fake-player score helpers.
  const dummyScore = (name: string) => dummy.score(ScoreTarget(name));
  const storeBit = (name: string) => store.score(ScoreTarget(name));
  const gamemodeScore = (name: string) => gm.score(ScoreTarget(name));

  // The working `#x/#y/#z` vector, and the `$x/$y/$z` inputs callers set before an `launch_*`
  // call.
  const work = ScoreVec3.from((axis) => dummyScore(`#${axis}`));
  // When 1, `launch/main` skips the gamemode swap and lets the player's own movement fire
  // the enchantment.
  const sustain = dummyScore("#sustain");
  const input = ScoreVec3.from((axis) => api.score(ScoreTarget(`$${axis}`)));
  // The last launch's input and resulting local vector, per player, for reuse.
  const prevInput = ScoreVec3.from((_, i) => prevIn[i].score(self()));
  const prevLocal = ScoreVec3.from((_, i) => prevOut[i].score(self()));

  // --- Data resources --------------------------------------------------------
  dp.registryFile(
    "enchantment",
    "internal/apply_impulse",
    enchantmentJson(`${ns}:${dp.functionName("launch/reset")}`, dp.version),
  );
  const largeGlobal = dp.predicate("internal/large_global", largeGlobalDef);
  const fallingCreative = dp.predicate(
    "internal/falling_creative_player",
    fallingCreativeDef,
  );

  // --- Function refs (created up front so bodies can cross-reference) ---------
  const fInit = dp.createFunction("init", "load");
  const fStoreX = dp.createFunction("store/x");
  const fStoreY = dp.createFunction("store/y");
  const fStoreZ = dp.createFunction("store/z");
  const fLaunchMain = dp.createFunction("launch/main");
  const fReset = dp.createFunction("launch/reset");
  const fUsePrevious = dp.createFunction("launch/use_previous");
  const fPolarGlobal = dp.createFunction("launch/handle_polar/global");
  const fStoreRefVectors = dp.createFunction(
    "math/global/store_reference_vectors",
  );
  const fConvertToLocal = dp.createFunction(
    "math/global/convert_to_local",
  );
  const fLaunchLocal = dp.public("launch_local_xyz");
  const fLaunchGlobal = dp.public("launch_global_xyz");

  return {
    dp,
    ns,
    self,
    marker,
    temp,
    // objectives
    api,
    dummy,
    math,
    gm,
    store,
    prevVecK,
    prevIn,
    prevOut,
    prevMethod,
    // score helpers
    dummyScore,
    storeBit,
    gamemodeScore,
    // working vector + public inputs
    work,
    sustain,
    input,
    prevInput,
    prevLocal,
    // predicate refs
    largeGlobal,
    fallingCreative,
    // function refs
    fInit,
    fStoreX,
    fStoreY,
    fStoreZ,
    fLaunchMain,
    fReset,
    fUsePrevious,
    fPolarGlobal,
    fStoreRefVectors,
    fConvertToLocal,
    fLaunchLocal,
    fLaunchGlobal,
  };
}

/** The shape threaded to every builder - whatever {@link createInternals} returns. */
export type PlayerMotionInternals = ReturnType<typeof createInternals>;
