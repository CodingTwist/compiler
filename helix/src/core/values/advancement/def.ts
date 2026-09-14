// `AdvancementDef`: criteria, reward, parent and display for `dp.advancement`.
import { VersionProfile } from "../../../versions/profile";
import { ItemValue, TextComponent } from "../item";
import type { CriterionJson, Trigger } from "./trigger";

/** `display.frame` - the advancement's toast/tree shape. */
export type AdvancementFrame = "task" | "goal" | "challenge";

/** An advancement's `display` block. Only `icon`'s base id is used, as in vanilla. */
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
 * An advancement built from {@link Trigger}s plus an optional reward function.
 *
 * Usually hidden, with one criterion and a reward that revokes it to re-arm:
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

  /** Adds a named criterion. */
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
