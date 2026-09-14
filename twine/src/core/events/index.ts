/**
 * `@On(detector)` runs a method when a condition becomes true.
 *
 * Datapack events are really a poll plus a latch. `@On` writes both, so you only write the body.
 * The detector is yours, so you choose what detection costs.
 */
export * from "./types";
export * from "./register";
export * from "./latches";
export * from "./rearm";
export * from "./group";
