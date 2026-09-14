import { EntityType, Id, Path, Pos, Range, ScoreTarget, Selector, math } from "helix";
import type { Datapack, FunctionContext, FunctionRef, IdentifiedEntityNbt, Objective, Score } from "helix";
import type { AreaTrigger, DatapackModule, ModuleScope, Vec3 } from "../core/module.interface";
import { rearmEvents } from "../core/events";
import { triggerZones } from "../core/regions";
import { StateMachine } from "../state-machine";
import type { Ability, BarStyle, BossBody, BossbarColor, Phase } from "./builder";

const MAX_INT = 2147483647;

type Bossbar = ReturnType<FunctionContext["bossbar"]>;

/** The `bossbar set <id> color <c>` builder method for each colour. */
const COLOR: Record<BossbarColor, (b: Bossbar, id: Id) => unknown> = {
  pink: (b, id) => b.setColorPink(id),
  blue: (b, id) => b.setColorBlue(id),
  red: (b, id) => b.setColorRed(id),
  green: (b, id) => b.setColorGreen(id),
  yellow: (b, id) => b.setColorYellow(id),
  purple: (b, id) => b.setColorPurple(id),
  white: (b, id) => b.setColorWhite(id),
};

export interface BossOpts {
  phases: Phase[];
  bar?: BarStyle;
  victory?: BossBody;
  defeat?: BossBody;
}

/** The module a {@link BossBuilder} compiles to. */
export class BossModule implements DatapackModule {
  private dp!: Datapack;
  private obj!: Objective;
  private dispatch!: FunctionRef;
  private enterFirst!: FunctionRef;
  private cleanupFn!: FunctionRef;
  private victoryFn!: FunctionRef;
  private defeatFn?: FunctionRef;

  constructor(
    private readonly name: string,
    private readonly nbt: IdentifiedEntityNbt,
    private readonly spawn: Pos,
    private readonly trigger: AreaTrigger,
    private readonly tickEvery: number,
    private readonly opts: BossOpts,
  ) {}

  /** The single boss entity, found by the tag the framework injects at summon. */
  private get boss(): Selector {
    return this.allBosses.limit(1);
  }
  /**
   * Every entity with the boss tag, for cleanup. No `limit=1`, so duplicate bosses get killed too.
   */
  private get allBosses(): Selector {
    return Selector.allEntities().type(EntityType(this.nbt.entity)).tag(this.name);
  }
  /** Everyone in the arena, recomputed each poll. */
  private get participants(): Selector {
    return Selector.allPlayers().tag(`${this.name}.p`);
  }
  private score(holder: string): Score {
    return this.obj.score(ScoreTarget(`#${this.name}.${holder}`));
  }
  private cooldown(phase: Phase, a: Ability): Score {
    return this.score(`cd.${phase.label}.${a.name}`);
  }
  private get barId(): Id {
    return Id(`${this.dp.name}:${this.name}`);
  }

  register(dp: Datapack, scope: ModuleScope): void {
    this.dp = dp;
    this.obj = dp.objective(this.name);

    // Abilities first - the phase bodies below call into them.
    const pickers = new Map<Phase, FunctionRef>();
    for (const phase of this.opts.phases) {
      if (phase.abilities.length > 0) pickers.set(phase, this.picker(scope, phase));
    }

    // The phase machine shares the boss's objective; its score holders don't collide.
    const sm = new StateMachine(dp, this.name);
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
    this.enterFirst = scope.fn(`${this.name}/enter_first`, (ctx) =>
      sm.go(ctx, this.opts.phases[0].label),
    );

    this.cleanupFn = scope.fn(`${this.name}/cleanup`, (ctx) => this.cleanup(ctx));
    this.victoryFn = scope.fn(`${this.name}/victory`, (ctx) => {
      if (this.opts.victory) this.asParticipants(ctx, this.opts.victory);
      ctx.call(this.cleanupFn);
    });
    if (this.opts.defeat) {
      const body = this.opts.defeat;
      this.defeatFn = scope.fn(`${this.name}/defeat`, (ctx) => {
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
    ctx.execute().as(this.boss).at(Selector.self()).run((b) => b.call(this.enterFirst));
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
          alive.execute().as(this.boss).at(Selector.self()).run((b) => b.call(this.dispatch));
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

  /** Mirror the mob's real health into a 0..100 percentage, and onto the bar. */
  private mirrorHealth(ctx: FunctionContext): void {
    const hp = this.score("hp");
    ctx
      .execute()
      .storeResultScore(hp)
      .run((b) => b.entity(this.boss).get(Path.Entity.Health, 100));
    math`${hp} / ${this.score("max")}`.into(hp, ctx);
    if (this.opts.bar) {
      ctx
        .execute()
        .storeResultBossbar(this.barId, "value")
        .run((b) => b.scoreGet(hp));
    }
  }

  /**
   * Recomputes who's in the arena each poll into a tag.
   * Bossbar and loot commands need one selector, and a union of zones isn't one.
   */
  private trackParticipants(ctx: FunctionContext): void {
    const tag = `${this.name}.p`;
    ctx.tag().remove(this.participants, tag);
    if (this.trigger.kind === "players") {
      ctx.tag().add(this.trigger.selector, tag);
    } else {
      for (const zone of triggerZones(this.trigger)) {
        if (zone.shape === "sphere") {
          ctx
            .execute()
            .positioned(Pos(...zone.center))
            .run((at) =>
              at.tag().add(Selector.allPlayers().distance(Range.atMost(zone.radius)), tag),
            );
        } else {
          ctx.tag().add(Selector.allPlayers().volume(zone.from as Vec3, zone.to as Vec3), tag);
        }
      }
    }
    if (this.opts.bar) ctx.bossbar().setPlayers(this.barId, this.participants);
  }

  /** Run `body` once as (and at) each arena player, so `@s` is someone to reward. */
  private asParticipants(ctx: FunctionContext, body: BossBody): void {
    ctx.execute().as(this.participants).at(Selector.self()).run(body);
  }

  private styleBar(ctx: FunctionContext, style: BarStyle): void {
    if (!this.opts.bar) return;
    const id = this.barId;
    ctx.bossbar().setName(id, style.name);
    if (style.color) COLOR[style.color](ctx.bossbar(), id);
  }

  /** Sums the weights of ready abilities and calls the picker if any are ready. */
  private rollAbility(ctx: FunctionContext, phase: Phase, pick: FunctionRef): void {
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
  private picker(scope: ModuleScope, phase: Phase): FunctionRef {
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

  /**
   * Resets the fight: no boss, no bar, no participants, cooldowns cleared, and `@On` latches
   * re-armed.
   *
   * Latches are scores that survive /reload, so without re-arming they'd block the next fight.
   */
  private cleanup(ctx: FunctionContext): void {
    ctx.kill(this.allBosses);
    if (this.opts.bar) ctx.bossbar().remove(this.barId);
    this.score("live").set(0);
    for (const phase of this.opts.phases) {
      for (const a of phase.abilities) this.cooldown(phase, a).set(0);
    }
    ctx.tag().remove(this.participants, `${this.name}.p`);
    rearmEvents(ctx, this.dp, this.name, this);
  }
}
