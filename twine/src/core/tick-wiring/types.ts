// The state threaded through the tick-tree walk.
import type { Datapack, FunctionContext, FunctionRef, Id } from "helix";
import type { ModuleRef } from "../module.interface";
import type { Graph, Node } from "../graph";
import type { ActiveFlags } from "../flags";
import type { EventLatches } from "../events";

/** One thing a module contributes to a tick, already bound to its instance. */
export type Emit = (ctx: FunctionContext) => void;

/** Everything the tick-tree walk needs threaded through it. */
export interface Wiring {
  graph: Graph;
  flags: ActiveFlags;
  latches: EventLatches;
  dp: Datapack;
  needsTick: (ref: ModuleRef) => boolean;
  activateOf: Map<ModuleRef, FunctionRef>;
  deactivateOf: Map<ModuleRef, FunctionRef>;
  /** Each area's effective dimension (own or inherited); `undefined` if none. */
  dims: Map<ModuleRef, Id | undefined>;
  /** A module's fire phase at a period; an explicit phase is used as-is. */
  phaseOf: (node: Node, period: number, explicit?: number) => number;
  /** Each module's `<name>/tick`, built once however many parents call it. */
  ticks: Map<ModuleRef, { fn: FunctionRef; dim?: Id }>;
}
