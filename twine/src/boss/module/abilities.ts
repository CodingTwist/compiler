// Weighted random ability picks, gated by per-ability cooldowns.
import { Range, math } from "helix";
import type { FunctionContext, FunctionRef } from "helix";
import type { ModuleScope } from "../../core/module.interface";
import type { Phase } from "../builder";
import { BossFight } from "./fight";

const MAX_INT = 2147483647;

/** Ability rolls for {@link BossModule}. */
export class BossAbilities extends BossFight {
  /** Sums the weights of ready abilities and calls the picker if any are ready. */
  protected rollAbility(ctx: FunctionContext, phase: Phase, pick: FunctionRef): void {
    const total = this.score("total");
    total.set(0);
    for (const a of phase.abilities) {
      ctx.if(this.cooldown(phase, a).matches(Range.atMost(0)), (ready) =>
        total.add(a.weight ?? 1, ready),
      );
    }
    ctx.if(total.matches(Range.atLeast(1)), (any) => any.call(pick));
  }

  /**
   * Picks a ready ability by weight.
   *
   * `random value` needs a build-time range, so roll the full int range and take it modulo the live
   * total. The bias is negligible.
   */
  protected picker(scope: ModuleScope, phase: Phase): FunctionRef {
    const roll = this.score("roll");
    const picked = this.score("pick");

    const tries = phase.abilities.map((a) => {
      const fire = scope.fn(`${this.name}/${phase.label}/${a.name}`, (ctx) => {
        picked.set(1);
        this.cooldown(phase, a).set(a.cooldown);
        a.body(ctx);
      });
      return scope.fn(`${this.name}/${phase.label}/try_${a.name}`, (ctx) => {
        roll.remove(a.weight ?? 1);
        ctx.if(roll.matches(Range.atMost(0)), (hit) => hit.call(fire));
      });
    });

    return scope.fn(`${this.name}/${phase.label}/pick`, (ctx) => {
      ctx
        .execute()
        .storeResultScore(roll)
        .run((b) => b.emit(b.random(0, MAX_INT)));
      // 1..total; each ability subtracts its weight in `try_*` until the roll hits zero.
      math`${roll} % ${this.score("total")} + 1`.into(roll, ctx);
      picked.set(0);
      phase.abilities.forEach((a, i) => {
        ctx
          .execute()
          .ifScoreMatches(picked, Range.exactly(0))
          .ifScoreMatches(this.cooldown(phase, a), Range.atMost(0))
          .run((b) => b.call(tries[i]));
      });
    });
  }
}
