// The boss module's state, and the selectors, scores and bar helpers every layer uses.
import { EntityType, Id, ScoreTarget, Selector } from "helix";
import type {
  Datapack,
  FunctionContext,
  FunctionRef,
  IdentifiedEntityNbt,
  Objective,
  Pos,
  Score,
} from "helix";
import type { AreaTrigger } from "../../core/module.interface";
import type {
  Ability,
  BarStyle,
  BossBody,
  BossbarColor,
  Phase,
} from "../builder";

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

/** The state of {@link BossModule}, and the names its layers share. */
export class BossParts {
  protected dp!: Datapack;
  protected obj!: Objective;
  protected dispatch!: FunctionRef;
  protected enterFirst!: FunctionRef;
  protected cleanupFn!: FunctionRef;
  protected victoryFn!: FunctionRef;
  protected defeatFn?: FunctionRef;

  constructor(
    protected readonly name: string,
    protected readonly nbt: IdentifiedEntityNbt,
    protected readonly spawn: Pos,
    protected readonly trigger: AreaTrigger,
    protected readonly tickEvery: number,
    protected readonly opts: BossOpts,
  ) {}

  /** The single boss entity, found by the tag the framework injects at summon. */
  protected get boss(): Selector {
    return this.allBosses.limit(1);
  }
  /**
   * Every entity with the boss tag, for cleanup. No `limit=1`, so duplicate bosses get killed too.
   */
  protected get allBosses(): Selector {
    return Selector.allEntities()
      .type(EntityType(this.nbt.entity))
      .tag(this.name);
  }
  /** Everyone in the arena, recomputed each poll. */
  protected get participants(): Selector {
    return Selector.allPlayers().tag(`${this.name}.p`);
  }
  protected score(holder: string): Score {
    return this.obj.score(ScoreTarget(`#${this.name}.${holder}`));
  }
  protected cooldown(phase: Phase, a: Ability): Score {
    return this.score(`cd.${phase.label}.${a.name}`);
  }
  protected get barId(): Id {
    return Id(`${this.dp.name}:${this.name}`);
  }

  /** Run `body` once as (and at) each arena player, so `@s` is someone to reward. */
  protected asParticipants(ctx: FunctionContext, body: BossBody): void {
    ctx.execute().as(this.participants).at(Selector.self()).run(body);
  }

  protected styleBar(ctx: FunctionContext, style: BarStyle): void {
    if (!this.opts.bar) return;
    const id = this.barId;
    ctx.bossbar().setName(id, style.name);
    if (style.color) COLOR[style.color](ctx.bossbar(), id);
  }
}
