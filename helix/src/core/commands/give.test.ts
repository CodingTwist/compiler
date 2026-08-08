import { describe, it, expect } from "vitest";
import { PlayerGiveCommand } from "./give";
import { ItemSpec, PlayerGiveNode } from "./give";
import { CodegenContext, Dispatcher } from "../ir/commandhandler";
import { Datapack } from "../ir/datapack";
import { createHandlerMap } from "../codegen/codegen";
import { Selector } from "../frontend/nodes/selector";
import { VersionProfile } from "../../versions/profile";
import { v1_21_4 } from "../../versions/profiles";
import { v1_20_1 } from "../../versions/profiles";

function ctxFor(version: VersionProfile): CodegenContext {
  const dp = new Datapack("testpack", version);
  return new CodegenContext(dp, new Dispatcher(createHandlerMap()));
}

function give(version: VersionProfile, item: ItemSpec): string {
  const ctx = ctxFor(version);
  new PlayerGiveCommand().generate(
    new PlayerGiveNode(Selector.allPlayers().build(), item),
    ctx,
  );
  return ctx.lines[0];
}

describe("PlayerGiveCommand - registry validation", () => {
  it("emits give for a valid item id", () => {
    expect(give(v1_21_4, { id: "minecraft:diamond", count: 3 })).toBe(
      "give @a minecraft:diamond 3",
    );
  });

  it("normalizes a bare item id and defaults count to 1", () => {
    expect(give(v1_21_4, { id: "diamond" })).toBe("give @a minecraft:diamond 1");
  });

  it("throws naming the version for an unknown item id", () => {
    expect(() => give(v1_21_4, { id: "minecraft:not_a_real_item" })).toThrow(
      /minecraft:not_a_real_item.*1\.21\.4/,
    );
  });
});

describe("PlayerGiveCommand - NBT vs components (model change)", () => {
  // Same authored node, lowered against two versions.
  const spec: ItemSpec = {
    id: "minecraft:diamond_sword",
    count: 1,
    customName: "Excalibur",
    customModelData: 1234,
    enchantments: new Map([["sharpness", 5]]),
  };

  it("lowers to data components on 1.20.5+", () => {
    expect(give(v1_21_4, spec)).toBe(
      `give @a minecraft:diamond_sword[custom_name={"text":"Excalibur"},custom_model_data={floats:[1234]},enchantments={"minecraft:sharpness":5}] 1`,
    );
  });

  it("lowers to NBT on pre-1.20.5", () => {
    expect(give(v1_20_1, spec)).toBe(
      `give @a minecraft:diamond_sword{display:{Name:'{"text":"Excalibur"}'},CustomModelData:1234,Enchantments:[{id:"minecraft:sharpness",lvl:5}]} 1`,
    );
  });

  it("plain item is identical across versions (no data)", () => {
    const plain: ItemSpec = { id: "minecraft:diamond", count: 2 };
    expect(give(v1_21_4, plain)).toBe(give(v1_20_1, plain));
    expect(give(v1_21_4, plain)).toBe("give @a minecraft:diamond 2");
  });
});
