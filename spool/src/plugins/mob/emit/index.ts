// The mob a builder compiles to. Wiring only: each job lives in its own file.
import { Range, ScoreTarget, Selector, privateName } from "helix";
import { rig } from "../../rig";
import type { Datapack, FunctionContext, FunctionRef } from "helix";
import { mobPreview, type MobPreview } from "../preview/rig";
import { registerGesture } from "./gestures";
import { MobParts } from "./parts";
import { registerStates, stateHandle } from "./states";
import { registerSummon } from "./summon";
import { tickOneBody } from "./tick-one";
import type { MobDef, MobFn } from "./types";
import { wakeBody } from "./wake";

export type { MobDef, MobFn, Relay } from "./types";

/**
 * A custom mob's codegen. {@link register} emits its functions; the caller runs {@link wake}
 * once a second and {@link tick} every `tickEvery` ticks.
 */
export class Mob<S extends string = string> {
  private readonly m: MobParts<S>;

  constructor(def: MobDef<S>) {
    this.m = new MobParts(def);
  }

  /** The mob's name: its tag and function folder. */
  get name(): string {
    return this.m.name;
  }

  /** The generated function `short`. Throws before {@link register}. */
  fnRef(short: string): FunctionRef {
    return this.m.fnRef(short);
  }

  /** `<name>/summon`: summons the mob wherever it is run. */
  get summon(): FunctionRef {
    return this.fnRef("summon");
  }
  /** `<name>/spawn`: summons one at the nearest player. */
  get spawn(): FunctionRef {
    return this.fnRef("spawn");
  }
  /** `<name>/on_tick`, the builder's `onTick` body. Throws if there isn't one. */
  get onTickFn(): FunctionRef {
    return this.fnRef("on_tick");
  }
  /** `<name>/wake`: finds the mobs near players and sweeps orphaned rigs. Run once a second. */
  get wake(): FunctionRef {
    return this.fnRef("wake");
  }
  /** Each gesture's raise function, by name - call it *as* the mob. */
  get gestures(): Record<string, FunctionRef> {
    return Object.fromEntries(this.m.def.gestures.map((g) => [g.name, this.fnRef(g.name)]));
  }
  /** Each state's enter function, by name - call it *as* the mob. */
  get states(): Record<string, FunctionRef> {
    return Object.fromEntries([...this.m.def.states.keys()].map((s) => [s, this.fnRef(`enter/${s}`)]));
  }

  /** The model and gesture timelines as plain data - what `writeMobPreview` renders. */
  preview(): MobPreview {
    const { model, gestures, tickEvery } = this.m.def;
    return mobPreview(model, gestures, tickEvery);
  }

  /**
   * Emits the mob's functions into `dp`.
   *
   * `fn` creates the functions called from outside the tick tree (summon, gestures, wake), so
   * a caller can wrap them, e.g. in a dimension.
   */
  register(dp: Datapack, fn?: MobFn): void {
    const m = this.m;
    m.dp = dp;
    m.fn =
      fn ??
      ((name, body) => {
        const ref = dp.createFunction(name);
        ref.build(body);
        return ref;
      });
    const { model, gestures, states } = m.def;
    m.rig = rig(dp, { name: m.name, model, fn: m.fn });

    // Before any author body is built: they all take the switch.
    if (states.size) {
      m.stateObj = dp.objective(`${m.name}.state`);
      m.stateClockObj = dp.objective(`${m.name}.state_t`);
      for (const s of states.keys())
        m.add(`enter/${s}`, dp.createFunction(`${m.name}/enter/${s}`));
    }
    m.handle = stateHandle(m);

    m.awakeObj = dp.objective(`${m.name}.awake`);
    registerSummon(m);
    for (const g of gestures) registerGesture(m, dp, g);
    if (m.def.tick) {
      const body = m.def.tick;
      m.add(
        "on_tick",
        m.fn(privateName(`${m.name}/on_tick`), (ctx) => body(ctx, dp, m.handle)),
      );
    }
    registerStates(m, dp);

    m.add(
      "wake",
      m.fn(privateName(`${m.name}/wake`), (ctx) => wakeBody(m, ctx)),
    );
    m.add(
      "tick_one",
      m.internal("tick_one", (ctx) => tickOneBody(m, ctx)),
    );
  }

  /** The per-tick poll. While no mob is near a player this costs a score check; scans run in {@link wake}. */
  tick(ctx: FunctionContext): void {
    const m = this.m;
    ctx
      .execute()
      .ifScoreMatches(m.awakeObj.score(ScoreTarget("#awake")), Range.atLeast(1))
      .as(m.mobs.tag(m.awakeTag))
      .at(Selector.self())
      .run((b) => b.call(m.fnRef("tick_one")));
  }
}
