import { VersionProfile } from "../../versions/profile";
import { BlockValue } from "./block";
import { Id } from "./id";
import { ItemValue, TextComponent } from "./item";
import { EntityPredicateSpec, LocationSpec, Predicate } from "./predicate";

/** JSON object Minecraft reads as one advancement criterion (`{ trigger, conditions? }`). */
export type CriterionJson = { trigger: string; conditions?: Record<string, unknown> };

function idStr(x: string | Id): string {
  return typeof x === "string" ? Id(x).render() : x.render();
}

function blockStr(x: string | BlockValue): string {
  return typeof x === "string" ? Id(x).render() : x.render();
}

/**
 * The rendered body of an `entity_properties` condition for `spec` - reuses
 * {@link Predicate.entity}'s rendering so a trigger's entity/location checks
 * stay in lockstep with predicate files (same slot names, same location
 * shape), instead of re-deriving that JSON here.
 */
function entityPredicateJson(
  spec: EntityPredicateSpec,
  version: VersionProfile,
): Record<string, unknown> {
  const json = Predicate.entity(spec, "this").toJson(version) as { predicate: Record<string, unknown> };
  return json.predicate;
}

/**
 * One advancement **trigger** with its conditions, built from typed concepts (no
 * hand-written JSON). The conditions are sourced from the same {@link ItemValue}
 * you'd `give`, so an item's "fires when used/attacked with" check matches the
 * exact item that was granted - one definition, like {@link Predicate}.
 *
 *   Trigger.usingItem(wand)          // right-click / use of the item
 *   Trigger.playerHurtEntity(wand)   // attacked something while holding it
 */
export class Trigger {
  private constructor(private readonly builder: (v: VersionProfile) => CriterionJson) {}

  /** The criterion JSON, with embedded item predicates rendered for `version`. */
  toJson(version: VersionProfile): CriterionJson {
    return this.builder(version);
  }

  /**
   * `minecraft:using_item` - fires while the player is using `item` (right-click
   * on a usable item). The `item` condition is the item's own predicate form.
   */
  static usingItem(item: ItemValue): Trigger {
    return new Trigger((v) => ({
      trigger: "minecraft:using_item",
      conditions: { item: item.toPredicate(v) },
    }));
  }

  /**
   * `minecraft:player_hurt_entity` - fires when the player damages an entity
   * while holding `item` in `slot` (default main hand). The held-item gate reuses
   * {@link Predicate.holding}, so "attacked with this item" matches the same way
   * "holding this item" does.
   */
  static playerHurtEntity(item: ItemValue, slot: "mainhand" | "offhand" = "mainhand"): Trigger {
    return new Trigger((v) => ({
      trigger: "minecraft:player_hurt_entity",
      conditions: { player: [Predicate.holding(item, slot).toJson(v)] },
    }));
  }

  /**
   * `minecraft:location` - fires when the player is at a location matching
   * `spec` (dimension / position bounds / biome / structure / block). Renders
   * through the same {@link EntityPredicateSpec.location} path as a predicate
   * file's `location_check`, so a "step into this box" trigger and a "check
   * they're still in this box" predicate can share one {@link LocationSpec}.
   */
  static location(spec: LocationSpec): Trigger {
    return new Trigger((v) => ({
      trigger: "minecraft:location",
      conditions: { player: entityPredicateJson({ location: spec }, v) },
    }));
  }

  /** `minecraft:enter_block` - fires when the player steps into `block`. */
  static enterBlock(block: string | BlockValue): Trigger {
    return new Trigger(() => ({
      trigger: "minecraft:enter_block",
      conditions: { block: blockStr(block) },
    }));
  }

  /** `minecraft:consume_item` - fires when the player eats/drinks `item`. */
  static consumeItem(item: ItemValue): Trigger {
    return new Trigger((v) => ({
      trigger: "minecraft:consume_item",
      conditions: { item: item.toPredicate(v) },
    }));
  }

  /**
   * `minecraft:player_killed_entity` - fires when the player kills an entity
   * matching `spec` (type / nbt / flags / ...). Omit `spec` to match any kill.
   */
  static playerKilledEntity(spec?: EntityPredicateSpec): Trigger {
    return new Trigger((v) => ({
      trigger: "minecraft:player_killed_entity",
      ...(spec ? { conditions: { entity: entityPredicateJson(spec, v) } } : {}),
    }));
  }

  /**
   * `minecraft:placed_block` - fires when the player places `block`,
   * optionally gated to a `location_check` on where it landed.
   */
  static placedBlock(block: string | Id, at?: LocationSpec): Trigger {
    return new Trigger((v) => {
      const conditions: Record<string, unknown> = { block: idStr(block) };
      if (at) conditions.location = [Predicate.location(at).toJson(v)];
      return { trigger: "minecraft:placed_block", conditions };
    });
  }

  /** `minecraft:inventory_changed` - fires on any inventory change. */
  static inventoryChanged(): Trigger {
    return new Trigger(() => ({ trigger: "minecraft:inventory_changed" }));
  }

  /** `minecraft:impossible` - never fires on its own; grant it via `/advancement grant`. */
  static impossible(): Trigger {
    return new Trigger(() => ({ trigger: "minecraft:impossible" }));
  }

  /** Escape hatch: a trigger by id with already-built conditions. */
  static of(trigger: string, conditions?: Record<string, unknown>): Trigger {
    return new Trigger(() => (conditions ? { trigger, conditions } : { trigger }));
  }
}

/** `display.frame` - the advancement's toast/tree shape. */
export type AdvancementFrame = "task" | "goal" | "challenge";

/**
 * The typed shape of an advancement's `display` block. `title`/`description`
 * accept the same plain-or-styled {@link TextComponent} shape as
 * `ItemValue.named`; `icon` is any {@link ItemValue} (only its base id is
 * used - components on it are ignored, matching vanilla's icon rendering).
 */
export interface AdvancementDisplay {
  title: TextComponent;
  description: TextComponent;
  icon: ItemValue;
  frame?: AdvancementFrame;
  showToast?: boolean;
  announceToChat?: boolean;
  hidden?: boolean;
  /** A texture path shown as the advancement tab's background (root advancements only). */
  background?: string;
}

/**
 * A registerable advancement, built from typed {@link Trigger}s plus an optional
 * **reward function**. Renders to the JSON written into
 * `data/<ns>/<advancement folder>/<name>.json` (via {@link Datapack.advancement}).
 *
 * The common shape is a *hidden trigger* advancement - no `display`, no `parent`,
 * one criterion, a `rewards.function`. The reward function typically runs some
 * behaviour and then `advancement revoke @s only <this>` to re-arm, giving an
 * event handler that fires once per occurrence.
 *
 *   dp.advancement("zzz/item/wand/on_attack",
 *     Advancement().criterion("trigger", Trigger.playerHurtEntity(wand))
 *       .reward("mypack:zzz/item/wand/on_attack"));
 */
export class AdvancementDef {
  private readonly criteria: Record<string, Trigger> = {};
  private rewardFn?: string;
  private parentId?: string;
  private displaySpec?: AdvancementDisplay;

  /** Add a named criterion (its trigger). Default requirements (all criteria) apply. */
  criterion(name: string, trigger: Trigger): this {
    this.criteria[name] = trigger;
    return this;
  }

  /** Set `rewards.function` to the function resource id (`<ns>:name`). */
  reward(functionId: string): this {
    this.rewardFn = functionId;
    return this;
  }

  /** Set `parent` to another advancement's resource id (`<ns>:name`). */
  parent(advancementId: string): this {
    this.parentId = advancementId;
    return this;
  }

  /** Set the `display` block (title/description/icon/frame/visibility). */
  display(spec: AdvancementDisplay): this {
    this.displaySpec = spec;
    return this;
  }

  /** The advancement JSON, with embedded values rendered for `version`. */
  toJson(version: VersionProfile): Record<string, unknown> {
    const criteria: Record<string, CriterionJson> = {};
    for (const [name, trigger] of Object.entries(this.criteria)) {
      criteria[name] = trigger.toJson(version);
    }
    const out: Record<string, unknown> = { criteria };
    if (this.parentId !== undefined) out.parent = this.parentId;
    if (this.displaySpec) {
      const d = this.displaySpec;
      out.display = {
        icon: { id: d.icon.baseId() },
        title: d.title,
        description: d.description,
        frame: d.frame ?? "task",
        show_toast: d.showToast ?? true,
        announce_to_chat: d.announceToChat ?? true,
        hidden: d.hidden ?? false,
        ...(d.background !== undefined ? { background: d.background } : {}),
      };
    }
    if (this.rewardFn !== undefined) out.rewards = { function: this.rewardFn };
    return out;
  }
}
