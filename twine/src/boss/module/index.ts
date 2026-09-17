/**
 * The module a {@link BossBuilder} compiles to: phases on a state machine, abilities, a bossbar
 * and victory/defeat.
 */
import { Path, Range, Selector } from "helix";
import type { Datapack, FunctionContext, FunctionRef } from "helix";
import type { DatapackModule, ModuleScope } from "../../core/module.interface";
import { StateMachine } from "../../state-machine";
import type { Phase } from "../builder";
import { BossAbilities } from "./abilities";

export type { BossOpts } from "./parts";

/** The module a {@link BossBuilder} compiles to. */
export class BossModule extends BossAbilities implements DatapackModule {
  register(dp: Datapack, scope: ModuleScope): void {
    this.dp = dp;
    this.obj = dp.objective(this.name);

    // Abilities first - the phase bodies below call into them.
    const pickers = new Map<Phase, FunctionRef>();
    for (const phase of this.opts.phases) {
      if (phase.abilities.length > 0)
        pickers.set(phase, this.picker(scope, phase));
    }

    // The phase machine shares the boss's objective; its score holders don't collide.
    const sm = new StateMachine(dp.root, this.name);
    for (const phase of this.opts.phases) {
      sm.state(phase.label, {
        onEnter: (ctx) => {
          if (phase.bar) this.styleBar(ctx, phase.bar);
          phase.onEnter?.(ctx);
        },
        onTick: (ctx) => {
          phase.onTick?.(ctx);
          const pick = pickers.get(phase);
          if (pick) this.rollAbility(ctx, phase, pick);
        },
        onExit: phase.onExit,
      });
    }
    // Phases chain in declaration order. No `initial()`, so the fight only starts from
    // `onActivate` and can be repeated.
    for (let i = 1; i < this.opts.phases.length; i++) {
      const to = this.opts.phases[i];
      sm.transition(
        this.opts.phases[i - 1].label,
        to.label,
        this.score("hp").matches(Range.atMost(to.at!)),
      );
    }
    this.dispatch = sm.build();
    this.enterFirst = scope.fn("enter_first", (ctx) =>
      sm.go(ctx, this.opts.phases[0].label),
    );

    this.cleanupFn = scope.fn("cleanup", (ctx) =>
      this.cleanup(ctx),
    );
    this.victoryFn = scope.fn("victory", (ctx) => {
      if (this.opts.victory) this.asParticipants(ctx, this.opts.victory);
      ctx.call(this.cleanupFn);
    });
    if (this.opts.defeat) {
      const body = this.opts.defeat;
      this.defeatFn = scope.fn("defeat", (ctx) => {
        this.asParticipants(ctx, body);
        ctx.call(this.cleanupFn);
      });
    }
  }

  onActivate(ctx: FunctionContext): void {
    ctx.call(this.cleanupFn); // a fresh fight, whatever the last one left behind
    if (this.opts.bar) {
      // ponytail: a /reload mid-fight logs one "bossbar already exists" error on the next start.
      ctx.bossbar().add(this.barId, this.opts.bar.name);
      ctx.bossbar().setMax(this.barId, 100);
      this.styleBar(ctx, this.opts.bar);
    }
    // The framework tag makes the mob findable later; `tagged` keeps the author's tags.
    ctx.summon(this.nbt.tagged(this.name), this.spawn);
    // Read max health from the mob itself, so it includes attribute modifiers.
    ctx
      .execute()
      .storeResultScore(this.score("max"))
      .run((b) => b.entity(this.boss).get(Path.Entity.Health, 1));
    this.score("live").set(1);
    ctx
      .execute()
      .as(this.boss)
      .at(Selector.self())
      .run((b) => b.call(this.enterFirst));
  }

  onTick(ctx: FunctionContext): void {
    ctx.if(this.score("live").equal(1), (live) => {
      // One `if entity` for the whole body, so the entity scan is paid once.
      live
        .execute()
        .ifEntity(this.boss)
        .run((alive) => {
          this.trackParticipants(alive);
          this.mirrorHealth(alive);
          for (const phase of this.opts.phases) {
            for (const a of phase.abilities) {
              // ponytail: decay goes negative unguarded; `matches ..0` doesn't care and cleanup
              // resets it.
              this.cooldown(phase, a).remove(this.tickEvery, alive);
            }
          }
          alive
            .execute()
            .as(this.boss)
            .at(Selector.self())
            .run((b) => b.call(this.dispatch));
        });
      // Death means the entity is gone, not health 0: a 5-tick poll can miss the health-0 tick.
      live
        .execute()
        .unlessEntity(this.boss)
        .run((gone) => gone.call(this.victoryFn));
    });
  }

  onDeactivate(ctx: FunctionContext): void {
    // `live == 0` here means the boss already died; players are just leaving.
    const lost = this.defeatFn ?? this.cleanupFn;
    ctx.if(this.score("live").equal(1), (c) => c.call(lost));
  }
}
