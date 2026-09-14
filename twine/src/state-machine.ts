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
 * A scoreboard state machine for quests, dialogue, puzzles and story flow.
 *
 * The dispatch reads a snapshot of the state, so a transition doesn't also run the new state in the
 * same tick. Call the returned dispatch from a module's `onTick`.
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
    this.cur.set(this.id(label));
    this.states.get(label)!.onEnter?.(ctx);
  }

  /**
   * Jumps to `label` now: runs the current `onExit`, sets the state, runs `label`'s `onEnter`. For
   * event-driven jumps outside the dispatch.
   */
  go(ctx: FunctionContext, label: string): void {
    for (const from of this.order) {
      const onExit = this.states.get(from)!.onExit;
      if (onExit) ctx.if(this.cur.equal(this.id(from)), onExit);
    }
    this.enter(ctx, label);
  }

  /**
   * Emits the machine's load setup and tick dispatch, and returns the dispatch to call from
   * `onTick`.
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
    this.snap.assign(this.cur, ctx);
    if (this.needsGuard()) this.done.set(0);
    for (const from of this.order) {
      ctx.if(this.snap.equal(this.id(from)), (sc) => this.runState(sc, from));
    }
  }

  /** The body for one state: its `onTick`, then its transitions (first match wins). */
  private runState(ctx: FunctionContext, from: string): void {
    const cfg = this.states.get(from)!;
    cfg.onTick?.(ctx);
    const outs = this.transitions.filter((t) => t.from === from);
    outs.forEach((t, i) => {
      const fire = (hit: FunctionContext) => {
        cfg.onExit?.(hit);
        this.enter(hit, t.to);
        if (outs.length > 1) this.done.set(1, hit);
      };
      // Later transitions gate on the settled flag so only the first match fires; the first can't
      // be settled yet.
      if (i === 0) ctx.if(t.when, fire);
      else ctx.if(this.done.equal(0), (g) => g.if(t.when, fire));
    });
  }

  /** Whether any state has more than one transition, so the first-match flag is needed. */
  private needsGuard(): boolean {
    const froms = this.transitions.map((t) => t.from);
    return new Set(froms).size < froms.length;
  }
}
