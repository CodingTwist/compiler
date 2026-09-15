// The boss fight's per-poll upkeep: health mirroring, arena tracking and cleanup.
import { Path, Pos, Range, Selector, math } from "helix";
import type { FunctionContext } from "helix";
import type { Vec3 } from "../../core/module.interface";
import { rearmEvents } from "../../core/events";
import { triggerZones } from "../../core/regions";
import { BossParts } from "./parts";

/** Health, participants and cleanup for {@link BossModule}. */
export class BossFight extends BossParts {
  /** Mirror the mob's real health into a 0..100 percentage, and onto the bar. */
  protected mirrorHealth(ctx: FunctionContext): void {
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
        .run((b) => hp.get(b));
    }
  }

  /**
   * Recomputes who's in the arena each poll into a tag.
   * Bossbar and loot commands need one selector, and a union of zones isn't one.
   */
  protected trackParticipants(ctx: FunctionContext): void {
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
              at
                .tag()
                .add(
                  Selector.allPlayers().distance(Range.atMost(zone.radius)),
                  tag,
                ),
            );
        } else {
          ctx
            .tag()
            .add(
              Selector.allPlayers().volume(zone.from as Vec3, zone.to as Vec3),
              tag,
            );
        }
      }
    }
    if (this.opts.bar) ctx.bossbar().setPlayers(this.barId, this.participants);
  }

  /**
   * Resets the fight: no boss, no bar, no participants, cooldowns cleared, and `@On` latches
   * re-armed.
   *
   * Latches are scores that survive /reload, so without re-arming they'd block the next fight.
   */
  protected cleanup(ctx: FunctionContext): void {
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
