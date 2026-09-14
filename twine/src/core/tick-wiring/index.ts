/**
 * Tick wiring: turns the module graph into per-module `<name>/tick` functions, with areas
 * gated by their triggers and leave checks.
 */
export type { Wiring } from "./types";
export { emitArea, wireTick } from "./tree";
