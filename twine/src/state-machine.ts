import { Datapack, ScoreTarget } from "helix";
import type {
  ExpressionNode,
  FunctionContext,
  FunctionRef,
  Objective,
} from "helix";

/** Code emitted at a state's enter / tick / exit point. */
export type StateBody = (ctx: FunctionContext) => void;

export interface StateConfig {
  /** Runs once when the machine enters this state (and at load for the initial state). */
  onEnter?: StateBody;
  /** Runs every dispatch while in this state (gate the dispatch call for throttling). */
  onTick?: StateBody;
  /** Runs once as the machine leaves this state. */
  onExit?: StateBody;
}

interface Transition {
  from: string;
  to: string;
  when: ExpressionNode;
}

/**
 * A scoreboard-backed finite state machine - the shared primitive behind quests,
 * dialogue trees, puzzles and story flow, so each isn't re-hand-rolled from raw
 * score latches. One {@link Objective} holds the machine; a fake-player holder is
 * one instance (run several instances of the same machine by varying the holder).
 *
 * The per-tick dispatch reads a **snapshot** of the current state and carries a
 * "transitioned this tick" guard, which avoids the classic datapack footgun where
 * a transition lands in a state whose block then also runs in the same tick.
 * Build it, then drive it by calling the returned dispatch ref from a module's
 * `onTick` (so it composes with area gating and tick throttling).
 */
export class StateMachine {
  private readonly states = new Map<string, StateConfig>();
  private readonly order: string[] = []; // declaration order → stable ids
  private readonly transitions: Transition[] = [];
  private initialState?: string;

  private readonly obj: Objective;
  private readonly holder: ScoreTarget; // the live current-state value
  private readonly snapshot: ScoreTarget; // per-tick frozen copy of holder
  private readonly settled: ScoreTarget; // 1 once a transition fired this tick

  constructor(
    private readonly dp: Datapack,
    public readonly name: string,
    instance = `#${name}`,
  ) {
    this.obj = dp.objective(name);
    this.holder = ScoreTarget(instance);
    this.snapshot = ScoreTarget(`${instance}.cur`);
    this.settled = ScoreTarget(`${instance}.done`);
  }

  /** The live current-state score. */
  private get cur() {
    return this.obj.score(this.holder);
  }
  /** The per-tick frozen copy of {@link cur}. */
  private get snap() {
    return this.obj.score(this.snapshot);
  }
  /** The "a transition already fired this tick" guard. */
  private get done() {
    return this.obj.score(this.settled);
  }

  /** Declare a state and its lifecycle bodies. */
  state(label: string, config: StateConfig = {}): this {
    if (this.states.has(label)) throw new Error(`Duplicate state "${label}"`);
    this.states.set(label, config);
    this.order.push(label);
    return this;
  }

  /** Set the state the machine starts in (seeded in `load`). */
  initial(label: string): this {
    this.initialState = label;
    return this;
  }

  /** A guarded transition: while in `from`, switch to `to` once `when` holds. */
  transition(from: string, to: string, when: ExpressionNode): this {
    this.transitions.push({ from, to, when });
    return this;
  }

  /** State id (1-based, so 0 reads as "unset" rather than a real state). */
  private id(label: string): number {
    const idx = this.order.indexOf(label);
    if (idx < 0) throw new Error(`Unknown state "${label}"`);
    return idx + 1;
  }

  /** A condition that holds while the machine is in `label` - for external gating. */
  is(label: string): ExpressionNode {
    return this.cur.equal(this.id(label));
  }

  /** Set the state to `label` and run its `onEnter` (the shared "become this state" step). */
  private enter(ctx: FunctionContext, label: string): void {
    this.cur.set(this.id(label), ctx);
    this.states.get(label)!.onEnter?.(ctx);
  }

  /**
   * Force a transition to `label` now: runs the current state's `onExit` (whichever
   * it is), sets the state, then runs `label`'s `onEnter`. Use for event-driven
   * jumps (a player click, a command) outside the guard-evaluated dispatch.
   */
  go(ctx: FunctionContext, label: string): void {
    for (const from of this.order) {
      const onExit = this.states.get(from)!.onExit;
      if (onExit) ctx.if(this.cur.equal(this.id(from)), onExit);
    }
    this.enter(ctx, label);
  }

  /**
   * Emit the machine: the `load` seeding of the initial state and the per-tick
   * dispatch function. Returns the dispatch {@link FunctionRef} - call it from a
   * module's `onTick` (optionally throttled) to run the machine.
   */
  build(): FunctionRef {
    if (this.initialState) {
      const init = this.initialState;
      this.dp.load((ctx) => this.enter(ctx, init));
    }
    const dispatch = this.dp.createFunction(`${this.name}/dispatch`);
    dispatch.build((ctx) => this.dispatch(ctx));
    return dispatch;
  }

  /** Per-tick body: freeze the state, clear the guard, then run the matching state. */
  private dispatch(ctx: FunctionContext): void {
    this.snap.copy(ctx, this.cur);
    this.done.set(0, ctx);
    for (const from of this.order) {
      ctx.if(this.snap.equal(this.id(from)), (sc) => this.runState(sc, from));
    }
  }

  /** The body for one state: its `onTick`, then its transitions (first match wins). */
  private runState(ctx: FunctionContext, from: string): void {
    const cfg = this.states.get(from)!;
    cfg.onTick?.(ctx);
    for (const t of this.transitions) {
      if (t.from !== from) continue;
      // Gate on the settled flag so only the first matching transition fires.
      ctx.if(this.done.equal(0), (g) =>
        g.if(t.when, (hit) => {
          cfg.onExit?.(hit);
          this.enter(hit, t.to);
          this.done.set(1, hit);
        }),
      );
    }
  }
}
