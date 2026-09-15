import type {
  Component,
  FunctionContext,
  Id,
  IdentifiedEntityNbt,
  Pos,
} from "helix";
import type { AreaTrigger, ConfiguredModule } from "../core/module.interface";
import { defineModule } from "../core/module.decorator";
import { BossModule } from "./module";

/** Commands emitted into a generated function. */
export type BossBody = (ctx: FunctionContext) => void;

/** The seven vanilla bossbar colours. */
export type BossbarColor =
  | "pink"
  | "blue"
  | "red"
  | "green"
  | "yellow"
  | "purple"
  | "white";

/** How the bar looks - set once at the start, and overridable per phase. */
export interface BarStyle {
  name: Component;
  color?: BossbarColor;
}

/**
 * One boss attack. The framework handles cooldown and selection; `body` runs as and at the boss.
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
  /** Health percentage at or below which this phase starts. Omit on the first phase. */
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

export interface Ability extends AbilityOpts {
  name: string;
}

export interface Phase extends PhaseOpts {
  label: string;
  abilities: Ability[];
}

/**
 * Builds a boss fight: a mob with health-based phases, weighted abilities on cooldowns, and a
 * bossbar.
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
 * The arena is a normal area trigger: entering starts the fight, and the arena emptying is a loss.
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

  /** Declares a phase. The first one declared is where the fight starts. */
  phase(label: string, opts: PhaseOpts = {}): this {
    if (this.phases.some((p) => p.label === label)) {
      throw new Error(`Duplicate boss phase "${label}"`);
    }
    if (this.phases.length > 0 && opts.at === undefined) {
      throw new Error(
        `Boss phase "${label}" needs an \`at\` health % threshold to enter it`,
      );
    }
    this.phases.push({ ...opts, label, abilities: [] });
    return this;
  }

  /**
   * Adds an ability to the last declared phase. To reuse one, add it to each phase with a shared
   * `body`.
   */
  ability(name: string, opts: AbilityOpts): this {
    const phase = this.phases[this.phases.length - 1];
    if (!phase)
      throw new Error(`Boss ability "${name}" declared before any phase`);
    if (phase.abilities.some((a) => a.name === name)) {
      throw new Error(
        `Duplicate ability "${name}" in boss phase "${phase.label}"`,
      );
    }
    phase.abilities.push({ ...opts, name });
    return this;
  }

  /** Runs when the boss dies, as each participant. */
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
    if (this.phases.length === 0)
      throw new Error(`Boss "${name}" declares no phases`);
    if (!this.trigger)
      throw new Error(`Boss "${name}" has no arena - call .arena(trigger)`);
    if (this.trigger.kind === "score") {
      throw new Error(
        `Boss "${name}" cannot use a \`score\` arena trigger: it has no geometry, so the fight cannot tell who is participating. Use a region/cuboid/zones or players trigger.`,
      );
    }
    const tickEvery = opts.tickEvery ?? 5;
    const module = new BossModule(
      name,
      this.nbt,
      this.spawn,
      this.trigger,
      tickEvery,
      {
        phases: this.phases,
        bar: this.bar,
        victory: this.victory,
        defeat: this.defeat,
      },
    );
    return defineModule(
      {
        name,
        area: true,
        trigger: this.trigger,
        tickEvery,
        dimension: opts.dimension,
      },
      module,
    );
  }
}

/** Start a boss-fight definition from the mob it spawns and where it spawns. */
export function defineBoss(nbt: IdentifiedEntityNbt, spawn: Pos): BossBuilder {
  return new BossBuilder(nbt, spawn);
}
