import { describe, it, expect } from "vitest";
import { AdvancementDef, Trigger } from ".";
import { Item } from "../item";
import { Datapack } from "../../ir/datapack";
import { buildDatapack } from "../../codegen/codegen";
import { v1_21_4 } from "../../../versions/profiles";
import { v1_20_1 } from "../../../versions/profiles";

describe("AdvancementDef", () => {
  it("renders criteria + reward function", () => {
    const wand = Item("stick").named("Frost Wand");
    const def = new AdvancementDef()
      .criterion("trigger", Trigger.usingItem(wand))
      .reward("mypack:zzz/item/stick/on_use");
    expect(def.toJson(v1_21_4)).toEqual({
      criteria: { trigger: Trigger.usingItem(wand).toJson(v1_21_4) },
      rewards: { function: "mypack:zzz/item/stick/on_use" },
    });
  });

  it("omits rewards when none is set", () => {
    const def = new AdvancementDef().criterion("t", Trigger.of("minecraft:tick"));
    expect(def.toJson(v1_21_4)).toEqual({
      criteria: { t: { trigger: "minecraft:tick" } },
    });
  });

  it("renders parent and a full display block", () => {
    const icon = Item("stone_bricks");
    const def = new AdvancementDef()
      .criterion("t", Trigger.impossible())
      .parent("mypack:core/root")
      .display({
        title: { text: "Title", color: "white" },
        description: { text: "Desc", color: "dark_gray" },
        icon,
        frame: "challenge",
        hidden: true,
      });
    expect(def.toJson(v1_21_4)).toEqual({
      criteria: { t: { trigger: "minecraft:impossible" } },
      parent: "mypack:core/root",
      display: {
        icon: { id: "minecraft:stone_bricks" },
        title: { text: "Title", color: "white" },
        description: { text: "Desc", color: "dark_gray" },
        frame: "challenge",
        show_toast: true,
        announce_to_chat: true,
        hidden: true,
      },
    });
  });
});

describe("Datapack.advancement registration", () => {
  it("emits JSON under the 1.21 singular folder and returns a referenceable id", () => {
    const dp = new Datapack("mypack", v1_21_4);
    const ref = dp.advancement(
      "zzz/item/stick/on_use",
      new AdvancementDef().criterion("trigger", Trigger.usingItem(Item("stick"))),
    );
    expect(ref.render()).toBe("mypack:zzz/item/stick/on_use");

    const files = buildDatapack(dp);
    const path = "data/mypack/advancement/zzz/item/stick/on_use.json";
    expect(files.has(path)).toBe(true);
    expect(JSON.parse(files.get(path)!).criteria.trigger.trigger).toBe("minecraft:using_item");
  });

  it("uses the plural `advancements` folder on pre-1.21 versions", () => {
    const dp = new Datapack("mypack", v1_20_1);
    dp.advancement("foo", new AdvancementDef().criterion("t", Trigger.of("minecraft:tick")));
    const files = buildDatapack(dp);
    expect(files.has("data/mypack/advancements/foo.json")).toBe(true);
  });

  it("event emits the advancement, the reward function, and the re-arming revoke", () => {
    const dp = new Datapack("mypack", v1_21_4);
    const { advancement, fn } = dp.event("exit/eat_chorus", Trigger.consumeItem(Item("chorus_fruit")), (ctx) => {
      ctx.say("out you go");
    });
    expect(advancement.render()).toBe("mypack:exit/eat_chorus");
    expect(dp.idOf(fn).render()).toBe("mypack:exit/eat_chorus");

    const files = buildDatapack(dp);
    const json = JSON.parse(files.get("data/mypack/advancement/exit/eat_chorus.json")!);
    expect(json.criteria.trigger.trigger).toBe("minecraft:consume_item");
    expect(json.rewards).toEqual({ function: "mypack:exit/eat_chorus" });

    const lines = files.get("data/mypack/function/exit/eat_chorus.mcfunction")!.trim().split("\n");
    expect(lines.at(-1)).toBe("advancement revoke @s only mypack:exit/eat_chorus");
  });

  it("nameless event is auto-named in the current group", () => {
    const dp = new Datapack("mypack", v1_21_4);
    const { advancement, fn } = dp.group("exit", () =>
      dp.event(Trigger.consumeItem(Item("chorus_fruit")), (ctx) => ctx.say("hi")),
    );
    expect(fn.getName()).toBe("exit/zzz/fn_0");
    expect(advancement.render()).toBe("mypack:exit/zzz/fn_0");
    const json = JSON.parse(buildDatapack(dp).get("data/mypack/advancement/exit/zzz/fn_0.json")!);
    expect(json.rewards).toEqual({ function: "mypack:exit/zzz/fn_0" });
  });

  it("rejects re-registering a name with a different definition", () => {
    const dp = new Datapack("mypack", v1_21_4);
    dp.advancement("foo", new AdvancementDef().criterion("t", Trigger.of("minecraft:tick")));
    expect(() =>
      dp.advancement("foo", new AdvancementDef().criterion("t", Trigger.of("minecraft:impossible"))),
    ).toThrow();
  });
});
