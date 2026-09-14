// The DatapackModule a mob compiles to. Wiring only: each job lives in its own file.
import { Range, ScoreTarget, Selector, atLeast, privateName } from "helix";
import type { Datapack, FunctionContext, FunctionRef } from "helix";
import type { DatapackModule, ModuleScope } from "../../core/module.interface";
import { registerGesture } from "./gestures";
import { MobParts } from "./parts";
import { registerStates, stateHandle } from "./states";
import { registerSummon } from "./summon";
import { tickOneBody } from "./tick-one";
import type { MobDef } from "./types";
import { wakeBody } from "./wake";

export type { MobDef, Relay } from "./types";

/** The {@link DatapackModule} a {@link MobBuilder} compiles to. */
export class MobModule<S extends string> implements DatapackModule {
  private readonly m: MobParts<S>;

  constructor(def: MobDef<S>) {
    this.m = new MobParts(def);
  }

  fnRef(short: string): FunctionRef {
    return this.m.fnRef(short);
  }

  register(dp: Datapack, scope: ModuleScope): void {
    const m = this.m;
    m.dp = dp;
    const { model, gestures, states } = m.def;
    model.named(m.rig);

    // Before any author body is built: they all take the switch.
    if (states.size) {
      m.stateObj = dp.objective(`${m.name}.state`);
      m.stateClockObj = dp.objective(`${m.name}.state_t`);
      for (const s of states.keys()) m.add(`enter/${s}`, dp.createFunction(`${m.name}/enter/${s}`));
    }
    m.handle = stateHandle(m);

    m.awakeObj = dp.objective(`${m.name}.awake`);
    registerSummon(m, scope);
    m.faceByRotate = atLeast(dp.version, "1.21.2");
    for (const g of gestures) registerGesture(m, dp, scope, g);
    if (m.def.tick) {
      const body = m.def.tick;
      m.add("on_tick", scope.fn(privateName(`${m.name}/on_tick`), (ctx) => body(ctx, dp, m.handle)));
    }
    registerStates(m, dp);

    m.add("wake", scope.fn(privateName(`${m.name}/wake`), (ctx) => wakeBody(m, ctx, scope)));
    m.add("tick_one", m.internal("tick_one", (ctx) => tickOneBody(m, ctx, scope)));
  }

  /** While no mob is near a player this costs a counter and a score check; scans run in `wake`, once a second. */
  onTick(ctx: FunctionContext): void {
    const m = this.m;
    const wake = m.awakeObj.score(ScoreTarget("#wake"));
    wake.add(1);
    ctx
      .execute()
      .ifScoreMatches(wake, Range.atLeast(Math.ceil(20 / m.def.tickEvery)))
      .run((b) => b.call(m.fnRef("wake")));
    ctx
      .execute()
      .ifScoreMatches(m.awakeObj.score(ScoreTarget("#awake")), Range.atLeast(1))
      .as(m.mobs.tag(m.awakeTag))
      .at(Selector.self())
      .run((b) => b.call(m.fnRef("tick_one")));
  }
}
