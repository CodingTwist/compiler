import { Id, Path, Pos, Range, Selector } from "helix";
import type {
  Component,
  Datapack,
  FunctionContext,
  FunctionRef,
  IdentifiedEntityNbt,
  Objective,
  Score,
} from "helix";
import { ScoreTarget } from "helix";
import type { AreaTrigger, ConfiguredModule, DatapackModule, ModuleScope, Vec3 } from "./module.interface";
import { defineModule } from "./module.decorator";
import { rearmEvents } from "./events";
import { triggerZones } from "./regions";
import { StateMachine } from "./state-machine";

/** Commands emitted into a generated function. */
export type BossBody = (ctx: FunctionContext) => void;

/** The seven vanilla bossbar colours. */
export type BossbarColor = "pink" | "blue" | "red" | "green" | "yellow" | "purple" | "white";

/** How the bar looks - set once at the start, and overridable per phase. */
export interface BarStyle {
  name: Component;
  color?: BossbarColor;
}

/**
 * One of a boss's attacks. The framework owns the cooldown (a score on the boss's
 * objective, decayed once per poll) and the selection; `body` is just what the
 * attack *does*, run as - and at - the boss.
 */
export interface AbilityOpts {
  /** Ticks before this ability can be picked again. */
  cooldown: number;
  /** Relative likelihood against the other *off-cooldown* abilities. Default `1`. */
  weight?: number;
  body: BossBody;
}

/** One stage of the fight. */
export interface PhaseOpts {
  /**
   * The health **percentage** at or below which the fight enters this phase.
   * Omit on the first phase - the first declared phase is where the fight starts.
   */
  at?: number;
  /** Re-style the bar on entering this phase (a new name, a new colour, or both). */
  bar?: BarStyle;
  /** Run once on entering / every poll while here / once on leaving. `@s` is the boss. */
  onEnter?: BossBody;
  onTick?: BossBody;
  onExit?: BossBody;
}

/** Extra module metadata `toModule` passes straight through. */
export interface BossModuleOpts {
  /** Poll period in ticks (default `5`). Cooldowns are measured against it. */
  tickEvery?: number;
  dimension?: Id;
}

interface Ability extends AbilityOpts {
  name: string;
}

interface Phase extends PhaseOpts {
  label: string;
  abilities: Ability[];
}

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

/**
 * Fluent builder for a **boss fight**: a real mob, staged by health percentage,
 * attacking out of a weighted pool of cooldown-gated abilities, with a bar bound
 * to whoever is in the arena. `toModule(name)` turns it into a drop-in
 * {@link ConfiguredModule} listed in a parent module's `imports`.
 *
 *   const king = defineBoss(Wither({ customName: "Bone King" }), Pos(0, 70, 0))
 *     .arena({ kind: "region", center: [0, 70, 0], radius: 30 })
 *     .bossbar(Component("Bone King"), "purple")
 *     .phase("one")
 *       .ability("slam", { cooldown: 60, weight: 3, body: (ctx) => ... })
 *     .phase("two", { at: 50, bar: { color: "red", name: Component("Enraged") } })
 *       .ability("beam", { cooldown: 40, body: (ctx) => ... })
 *     .onVictory((ctx) => ctx.loot().giveLoot(Selector.self(), reward));
 *
 *   @Module({ name: "keep", imports: [king.toModule("bone_king")] })
 *
 * The arena is an ordinary `area` trigger, so entering the zone starts the fight
 * and the region emptying (everyone left, or everyone died and respawned outside)
 * is the loss condition - no separate arena concept, and "everyone dead = fail"
 * costs no code.
 */
export class BossBuilder {
  private readonly phases: Phase[] = [];
  private trigger?: AreaTrigger;
  private bar?: BarStyle;
  private victory?: BossBody;
  private defeat?: BossBody;

  constructor(
    private readonly nbt: IdentifiedEntityNbt,
    private readonly spawn: Pos,
  ) {}

  /** Where the fight happens - the same {@link AreaTrigger} any area module takes. */
  arena(trigger: AreaTrigger): this {
    this.trigger = trigger;
    return this;
  }

  /** Show a bar while the fight runs, tracking the boss's health. */
  bossbar(name: Component, color?: BossbarColor): this {
    this.bar = { name, color };
    return this;
  }

  /** Declare a phase. The **first** one declared is where the fight starts. */
  phase(label: string, opts: PhaseOpts = {}): this {
    if (this.phases.some((p) => p.label === label)) {
      throw new Error(`Duplicate boss phase "${label}"`);
    }
    if (this.phases.length > 0 && opts.at === undefined) {
      throw new Error(`Boss phase "${label}" needs an \`at\` health % threshold to enter it`);
    }
    this.phases.push({ ...opts, label, abilities: [] });
    return this;
  }

  /**
   * Attach an ability to the **most recently declared phase**. To use the same
   * attack in two phases, declare it in both off a shared `body` - a name
   * registry would buy nothing but a string back-reference.
   */
  ability(name: string, opts: AbilityOpts): this {
    const phase = this.phases[this.phases.length - 1];
    if (!phase) throw new Error(`Boss ability "${name}" declared before any phase`);
    if (phase.abilities.some((a) => a.name === name)) {
      throw new Error(`Duplicate ability "${name}" in boss phase "${phase.label}"`);
    }
    phase.abilities.push({ ...opts, name });
    return this;
  }

  /** The boss died. Runs **as each participant**, so `@s` is a player to reward. */
  onVictory(body: BossBody): this {
    this.victory = body;
    return this;
  }

  /** The arena emptied with the boss still alive. Runs as each participant. */
  onDefeat(body: BossBody): this {
    this.defeat = body;
    return this;
  }

  /** Compile to a drop-in {@link ConfiguredModule} (name = module / objective / tag id). */
  toModule(name: string, opts: BossModuleOpts = {}): ConfiguredModule {
    if (this.phases.length === 0) throw new Error(`Boss "${name}" declares no phases`);
    if (!this.trigger) throw new Error(`Boss "${name}" has no arena - call .arena(trigger)`);
    if (this.trigger.kind === "score") {
      throw new Error(
        `Boss "${name}" cannot use a \`score\` arena trigger: it has no geometry, so the fight cannot tell who is participating. Use a region/cuboid/zones or players trigger.`,
      );
    }
    const tickEvery = opts.tickEvery ?? 5;
    const module = new BossModule(name, this.nbt, this.spawn, this.trigger, tickEvery, {
      phases: this.phases,
      bar: this.bar,
      victory: this.victory,
      defeat: this.defeat,
    });
    return defineModule(
      { name, area: true, trigger: this.trigger, tickEvery, dimension: opts.dimension },
      module,
    );
  }
}

interface BossOpts {
  phases: Phase[];
  bar?: BarStyle;
  victory?: BossBody;
  defeat?: BossBody;
}

/**
 * The {@link DatapackModule} a {@link BossBuilder} compiles to. Owns nothing at
 * construction; everything is materialised in `register` (the phase machine, the
 * ability functions, the cleanup/victory/defeat functions) and driven from
 * `onTick` / `onActivate` / `onDeactivate`.
 */
class BossModule implements DatapackModule {
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
    return Selector.allEntities().tag(this.name).limit(1);
  }
  /**
   * Every entity wearing the boss tag - what cleanup kills. Deliberately *not*
   * {@link boss}: a `limit=1` kill would leave a duplicate boss alive, which is
   * precisely the state cleanup exists to get out of.
   */
  private get allBosses(): Selector {
    return Selector.allEntities().tag(this.name);
  }
  /** Everyone currently in the arena. Recomputed each poll, so never stale. */
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

    // The phase machine shares the boss's objective (its holders are `#<name>`,
    // `#<name>.cur`, `#<name>.done`, none of which collide with the fight's).
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
    // Linear chain in declaration order: each phase is entered at its own health
    // threshold. Deliberately no `initial()` - an unseeded state leaves the boss
    // inert at load, so `onActivate` is the only way in and the fight is repeatable.
    for (let i = 1; i < this.opts.phases.length; i++) {
      const to = this.opts.phases[i];
      sm.transition(
        this.opts.phases[i - 1].label,
        to.label,
        this.score("hp").matches(new Range(undefined, to.at!)),
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
      // ponytail: no way to test a bossbar exists, so a /reload mid-fight logs one
      // "bossbar already exists" console error on the next start. Not worth guarding.
      ctx.bossbar().add(this.barId, this.opts.bar.name);
      ctx.bossbar().setMax(this.barId, 100);
      this.styleBar(ctx, this.opts.bar);
    }
    // The framework's own tag is what makes the mob addressable afterwards;
    // `tagged` appends, so the author's own tags survive.
    ctx.summon(this.nbt.tagged(this.name), this.spawn);
    // Max health read from the mob itself at full health - no config field to
    // silently disagree with the NBT, and attribute modifiers are included.
    ctx
      .execute()
      .storeResultScore(this.score("max"))
      .run((b) => b.entity(this.boss).get(Path.Entity.Health, 1));
    this.score("live").set(1, ctx);
    ctx.execute().as(this.boss).at(Selector.self()).run((b) => b.call(this.enterFirst));
  }

  onTick(ctx: FunctionContext): void {
    ctx.if(this.score("live").equal(1), (live) => {
      // One `if entity` for the whole body, not one per command: `run` commits a
      // multi-command body to its own function, so the entity scan - the expensive
      // half of the poll - is paid once.
      live
        .execute()
        .ifEntity(this.boss)
        .run((alive) => {
          this.trackParticipants(alive);
          this.mirrorHealth(alive);
          for (const phase of this.opts.phases) {
            for (const a of phase.abilities) {
              // ponytail: unguarded decay drifts negative; `matches ..0` doesn't care
              // and cleanup zeroes it. int32 floor is ~5 years of continuous fight.
              this.cooldown(phase, a).remove(this.tickEvery, alive);
            }
          }
          alive.execute().as(this.boss).at(Selector.self()).run((b) => b.call(this.dispatch));
        });
      // Death is the entity being *gone*, not health 0: a real mob that dies is
      // removed, and a health-0 window is one tick that a 5-tick poll misses.
      // Despawn/unload lands here too, and cleanup is the right answer there.
      live
        .execute()
        .unlessEntity(this.boss)
        .run((gone) => gone.call(this.victoryFn));
    });
  }

  onDeactivate(ctx: FunctionContext): void {
    // `live == 0` here means the boss was already killed and cleaned up; this is
    // just the players wandering off afterwards.
    if (this.defeatFn) {
      const fn = this.defeatFn;
      ctx.if(this.score("live").equal(1), (lost) => lost.call(fn));
    } else {
      ctx.if(this.score("live").equal(1), (lost) => lost.call(this.cleanupFn));
    }
  }

  /** Mirror the mob's real health into a 0..100 percentage, and onto the bar. */
  private mirrorHealth(ctx: FunctionContext): void {
    const hp = this.score("hp");
    ctx
      .execute()
      .storeResultScore(hp)
      .run((b) => b.entity(this.boss).get(Path.Entity.Health, 100));
    hp.divide(this.score("max"), ctx);
    if (this.opts.bar) {
      ctx
        .execute()
        .storeResultBossbar(this.barId, "value")
        .run((b) => b.scoreGet(hp));
    }
  }

  /**
   * Recompute arena membership from scratch each poll. `bossbar set … players`
   * and a reward `loot give` each want *one* selector, and a union of zones isn't
   * one - so the geometry is collapsed into a tag. Recomputing (rather than
   * tracking enter/leave edges) costs 2-3 commands and can never go stale.
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
              at.tag().add(Selector.allPlayers().distance(new Range(undefined, zone.radius)), tag),
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

  /**
   * Sum the weights of the abilities that are **off cooldown**, then hand off to
   * the picker if any are. A total of `0` (everything on cooldown) simply fails
   * the guard - no roll, no special case.
   */
  private rollAbility(ctx: FunctionContext, phase: Phase, pick: FunctionRef): void {
    const total = this.score("total");
    total.set(0, ctx);
    for (const a of phase.abilities) {
      ctx.if(this.cooldown(phase, a).matches(new Range(undefined, 0)), (ready) =>
        total.add(a.weight ?? 1, ready),
      );
    }
    ctx.if(total.matches(new Range(1, undefined)), (any) => any.call(pick));
  }

  /**
   * The weighted pick. `random value` takes a *build-time literal* range, so it
   * cannot roll `1..total` when the total depends on which abilities happen to be
   * ready - roll the full int range and take it modulo the live total instead.
   * The bias that introduces is ~5e-9 for any sane weight sum; ignore it.
   *
   * The winner is then found by walking cumulative thresholds across the ready
   * abilities, each in its own function so the walk can stop.
   */
  private picker(scope: ModuleScope, phase: Phase): FunctionRef {
    const roll = this.score("roll");
    const picked = this.score("pick");

    const tries = phase.abilities.map((a) => {
      const fire = scope.fn(`${this.name}/${phase.label}/${a.name}`, (ctx) => {
        picked.set(1, ctx);
        this.cooldown(phase, a).set(a.cooldown, ctx);
        a.body(ctx);
      });
      return scope.fn(`${this.name}/${phase.label}/try_${a.name}`, (ctx) => {
        roll.remove(a.weight ?? 1, ctx);
        ctx.if(roll.matches(new Range(undefined, 0)), (hit) => hit.call(fire));
      });
    });

    return scope.fn(`${this.name}/${phase.label}/pick`, (ctx) => {
      ctx
        .execute()
        .storeResultScore(roll)
        .run((b) => b.emit(b.random(0, MAX_INT)));
      roll.modulo(this.score("total"), ctx);
      roll.add(1, ctx);
      picked.set(0, ctx);
      phase.abilities.forEach((a, i) => {
        ctx
          .execute()
          .ifScoreMatches(picked, new Range(0, 0))
          .ifScoreMatches(this.cooldown(phase, a), new Range(undefined, 0))
          .run((b) => b.call(tries[i]));
      });
    });
  }

  /**
   * Put the fight back to untouched: no boss, no bar, no participants, every
   * cooldown clear - and every `@On` latch on this instance re-armed, because a
   * latch is a scoreboard value that outlives a `/reload` and would otherwise
   * suppress its trigger for good on the second run of the fight.
   */
  private cleanup(ctx: FunctionContext): void {
    ctx.kill(this.allBosses);
    if (this.opts.bar) ctx.bossbar().remove(this.barId);
    this.score("live").set(0, ctx);
    for (const phase of this.opts.phases) {
      for (const a of phase.abilities) this.cooldown(phase, a).set(0, ctx);
    }
    ctx.tag().remove(this.participants, `${this.name}.p`);
    rearmEvents(ctx, this.dp, this.name, this);
  }
}

/** Start a boss-fight definition from the mob it spawns and where it spawns. */
export function defineBoss(nbt: IdentifiedEntityNbt, spawn: Pos): BossBuilder {
  return new BossBuilder(nbt, spawn);
}
