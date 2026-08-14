import { describe, it, expect } from "vitest";
import { Predicate, PredicateRef, SLOTS } from "./predicate";
import { Nbt, Short } from "./nbt";
import { Item } from "./item";
import { Datapack } from "../ir/datapack";
import { v26_1_2 } from "../../versions/profiles";
import { buildDatapack } from "../codegen/codegen";
import { Selector } from "../frontend/nodes/selector";
import { Dispatcher, CodegenContext } from "../ir/commandhandler";
import { createHandlerMap } from "../codegen/codegen";
import { IfElseNode, predicateCheck } from "../commands/if";
import { FunctionNode } from "../ir/node";
import { FunctionContext } from "../frontend/context";
import { v1_21_4 } from "../../versions/profiles";
import { v1_20_1 } from "../../versions/profiles";

describe("Predicate builder", () => {
  it("renders an entity_properties check with an embedded NBT match", () => {
    const p = Predicate.entity({
      type: "zombie",
      nbt: Nbt({ SleepTimer: Short(100) }),
    });
    expect(p.toJson(v1_21_4)).toEqual({
      condition: "minecraft:entity_properties",
      entity: "this",
      predicate: {
        type: "minecraft:zombie",
        nbt: "{SleepTimer:100s}",
      },
    });
  });

  it("composes all_of / any_of / inverted", () => {
    const onFire = Predicate.entity({ flags: { is_on_fire: true } });
    const sneaking = Predicate.entity({ flags: { is_sneaking: true } });
    const combined = onFire.and(sneaking.not());
    const json = combined.toJson(v1_21_4) as Record<string, unknown>;
    expect(json.condition).toBe("minecraft:all_of");
    const terms = json.terms as Record<string, unknown>[];
    expect(terms[0].condition).toBe("minecraft:entity_properties");
    expect(terms[1].condition).toBe("minecraft:inverted");
  });

  it("renders entity_scores bounds", () => {
    const p = Predicate.scores({ kills: { min: 5 }, deaths: 0 });
    expect(p.toJson(v1_21_4)).toEqual({
      condition: "minecraft:entity_scores",
      entity: "this",
      scores: { kills: { min: 5, max: undefined }, deaths: 0 },
    });
  });
});

describe("Datapack.predicate registration", () => {
  it("emits a predicate JSON file under the 1.21 singular folder and returns a ref", () => {
    const dp = new Datapack("mypack", v1_21_4);
    const ref = dp.predicate("sleeping", Predicate.entity({ nbt: Nbt({ SleepTimer: Short(1) }) }));
    expect(ref).toBeInstanceOf(PredicateRef);
    expect(ref.id).toBe("mypack:sleeping");

    const files = buildDatapack(dp);
    const path = "data/mypack/predicate/sleeping.json";
    expect(files.has(path)).toBe(true);
    expect(JSON.parse(files.get(path)!)).toMatchObject({
      condition: "minecraft:entity_properties",
    });
  });

  it("uses the plural `predicates` folder on pre-1.21 versions", () => {
    const dp = new Datapack("mypack", v1_20_1);
    dp.predicate("foo", Predicate.randomChance(0.5));
    const files = buildDatapack(dp);
    expect(files.has("data/mypack/predicates/foo.json")).toBe(true);
  });

  it("rejects re-registering a name with a different definition", () => {
    const dp = new Datapack("mypack", v1_21_4);
    dp.predicate("foo", Predicate.randomChance(0.5));
    expect(() => dp.predicate("foo", Predicate.randomChance(0.25))).toThrow();
  });
});

describe("Item as single source of truth (give <-> predicate)", () => {
  it("renders one Item definition to both a give stack and a match_tool predicate", () => {
    const excalibur = Item("diamond_sword")
      .named("Excalibur")
      .enchant("sharpness", 5)
      .modelData(1234);

    // Give form: the item-stack string.
    expect(excalibur.render(v1_21_4)).toBe(
      `minecraft:diamond_sword[custom_name={"text":"Excalibur"},custom_model_data={floats:[1234]},enchantments={"minecraft:sharpness":5}]`,
    );

    // Predicate form: built from the SAME components, no redefinition.
    expect(Predicate.matchTool(excalibur).toJson(v1_21_4)).toEqual({
      condition: "minecraft:match_tool",
      predicate: {
        items: "minecraft:diamond_sword",
        components: {
          "minecraft:custom_name": { text: "Excalibur" },
          "minecraft:custom_model_data": { floats: [1234] },
          "minecraft:enchantments": { "minecraft:sharpness": 5 },
        },
      },
    });
  });

  it("lowers the same Item to NBT-era give + predicate on pre-1.21", () => {
    const item = Item("diamond_sword").named("Excalibur").enchant("sharpness", 5);
    expect(item.render(v1_20_1)).toBe(
      `minecraft:diamond_sword{display:{Name:'{"text":"Excalibur"}'},Enchantments:[{id:"minecraft:sharpness",lvl:5}]}`,
    );
    expect(item.toPredicate(v1_20_1)).toEqual({
      items: "minecraft:diamond_sword",
      nbt: `{display:{Name:'{"text":"Excalibur"}'},Enchantments:[{id:"minecraft:sharpness",lvl:5}]}`,
    });
  });
});

describe("Selector.predicate integration", () => {
  it("adds a predicate=<id> arm from a PredicateRef", () => {
    const dp = new Datapack("mypack", v1_21_4);
    const ref = dp.predicate("hider", Predicate.entity({ flags: { is_sneaking: true } }));
    const sel = Selector.allPlayers().predicate(ref);
    expect(sel.render(v1_21_4)).toBe("@a[predicate=mypack:hider]");
  });

  it("accepts a raw id string and normalizes the namespace", () => {
    const sel = Selector.allEntities().predicate("mypack:hider");
    expect(sel.render(v1_21_4)).toBe("@e[predicate=mypack:hider]");
  });
});

describe("predicateCheck in ctx.if", () => {
  function env() {
    const dp = new Datapack("mypack", v1_21_4);
    const dispatcher = new Dispatcher(createHandlerMap());
    const ctx = new CodegenContext(dp, dispatcher);
    return { dp, dispatcher, ctx };
  }

  it("compiles to `execute if predicate <id> run ...`", () => {
    const { dp, dispatcher, ctx } = env();
    const ref = dp.predicate("hider", Predicate.entity({ flags: { is_sneaking: true } }));

    const thenBody = new FunctionNode("__scratch");
    const innerCtx = new FunctionContext(thenBody, v1_21_4);
    innerCtx.say("hi");

    dispatcher.dispatch(new IfElseNode(predicateCheck(ref), thenBody), ctx);
    expect(ctx.lines[0]).toContain("execute if predicate mypack:hider run");
  });
});

describe("inventory slot matches", () => {
  it("Predicate.carrying matches an item anywhere in the inventory", () => {
    const dp = new Datapack("p", v26_1_2);
    const ref = dp.predicate("has_disc", Predicate.carrying(Item.MUSIC_DISC_11));
    const json = JSON.parse(
      buildDatapack(dp).get("data/p/predicate/has_disc.json")!,
    );
    expect(ref.id).toBe("p:has_disc");
    expect(json).toEqual({
      condition: "minecraft:entity_properties",
      entity: "this",
      predicate: {
        slots: {
          "container.*": { items: "minecraft:music_disc_11" },
        },
      },
    });
  });

  it("carries the item's components into the slot match", () => {
    const dp = new Datapack("p", v26_1_2);
    dp.predicate(
      "has_door",
      Predicate.carrying(Item.SPRUCE_DOOR.named("Anachronistic Door")),
    );
    const json = JSON.parse(
      buildDatapack(dp).get("data/p/predicate/has_door.json")!,
    );
    const slot = json.predicate.slots["container.*"];
    expect(slot.items).toBe("minecraft:spruce_door");
    expect(slot.components).toBeDefined();
  });

  it("a named slot range narrows the match", () => {
    const dp = new Datapack("p", v26_1_2);
    dp.predicate(
      "head",
      Predicate.entity({ slots: { [SLOTS.HEAD]: Item.PLAYER_HEAD } }),
    );
    const json = JSON.parse(buildDatapack(dp).get("data/p/predicate/head.json")!);
    expect(Object.keys(json.predicate.slots)).toEqual(["armor.head"]);
  });
});

describe("item sub-predicates", () => {
  it("asks about a component instead of matching its value, and inverts", () => {
    const enchanted = Item("diamond_sword").subPredicate("enchantments", [{}]);

    expect(Predicate.matchTool(enchanted).toJson(v26_1_2)).toEqual({
      condition: "minecraft:match_tool",
      predicate: {
        items: "minecraft:diamond_sword",
        predicates: { "minecraft:enchantments": [{}] },
      },
    });

    // No negative form in vanilla item predicates - negate the condition.
    expect(Predicate.matchTool(enchanted).not().toJson(v26_1_2)).toMatchObject({
      condition: "minecraft:inverted",
    });

    // Predicate-only: never leaks into the give/stack form.
    expect(enchanted.render(v26_1_2)).toBe("minecraft:diamond_sword");
  });
});
