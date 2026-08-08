import { describe, it, expect } from "vitest";
import { Datapack } from "../ir/datapack";
import { buildResourcePack, buildPackMcmeta } from "../codegen/codegen";
import { v26_2 } from "../../versions/profiles";
import { v1_21_4 } from "../../versions/profiles";
import { v1_20_4 } from "../../versions/profiles";
import { Item } from "./item";
import { Model, ModelRef } from "./model";
import { BlockState } from "./block-state";

/** Build the resource pack and return the parsed JSON at `path` (fails if missing). */
function emitted(dp: Datapack, path: string): any {
  const files = buildResourcePack(dp);
  expect(files.has(path), `expected file ${path}`).toBe(true);
  return JSON.parse(files.get(path)!);
}

describe("Model builder", () => {
  it("Model.item renders a flat generated sprite", () => {
    expect(Model.item("minecraft:item/carrot_on_a_stick").toJson()).toEqual({
      parent: "minecraft:item/generated",
      textures: { layer0: "minecraft:item/carrot_on_a_stick" },
    });
  });

  it("parent/texture normalize ids; bare texture gets minecraft:", () => {
    expect(new Model().parent("block/cube_all").texture("all", "block/stone").toJson()).toEqual({
      parent: "minecraft:block/cube_all",
      textures: { all: "minecraft:block/stone" },
    });
  });

  it("raw JSON wins over typed fields", () => {
    const json = { parent: "custom:thing", elements: [] };
    expect(new Model().parent("x").raw(json).toJson()).toBe(json);
  });
});

describe("dp.model registration + resource-pack codegen", () => {
  it("emits the model file and the 1.21.4+ item definition, returns a ModelRef", () => {
    const dp = new Datapack("testpack", v26_2);
    const ref = dp.model("web", Model.item("minecraft:item/carrot_on_a_stick"));
    expect(ref).toBeInstanceOf(ModelRef);
    expect(ref.id).toBe("testpack:web");

    expect(emitted(dp, "assets/testpack/models/item/web.json")).toEqual({
      parent: "minecraft:item/generated",
      textures: { layer0: "minecraft:item/carrot_on_a_stick" },
    });
    expect(emitted(dp, "assets/testpack/items/web.json")).toEqual({
      model: { type: "minecraft:model", model: "testpack:item/web" },
    });
  });

  it("omits the item definition on versions predating it (pre-1.21.4)", () => {
    const dp = new Datapack("testpack", v1_20_4);
    dp.model("web", Model.item("minecraft:item/carrot_on_a_stick"));
    const files = buildResourcePack(dp);
    expect(files.has("assets/testpack/models/item/web.json")).toBe(true);
    expect(files.has("assets/testpack/items/web.json")).toBe(false);
  });

  it("resourceFile writes verbatim under assets/", () => {
    const dp = new Datapack("testpack", v26_2);
    dp.resourceFile("blockstates", "foo", { variants: {} });
    expect(emitted(dp, "assets/testpack/blockstates/foo.json")).toEqual({ variants: {} });
  });

  it("the resource pack.mcmeta uses the RESOURCE format, not the data one", () => {
    const dp = new Datapack("testpack", v26_2);
    const mcmeta = buildPackMcmeta(dp, dp.version.resourcePack).pack as any;
    const dataMcmeta = buildPackMcmeta(dp).pack as any;
    // 26.2: data 107 / resource 88 - they must differ.
    expect(mcmeta.min_format).not.toEqual(dataMcmeta.min_format);
    expect(mcmeta.min_format).toEqual([v26_2.resourcePack.kind === "range" ? v26_2.resourcePack.min[0] : 0, 0]);
  });
});

describe("block models + blockstates", () => {
  it("Model.cubeAll builds a full-cube block model", () => {
    expect(Model.cubeAll("modules_demo:block/glow").toJson()).toEqual({
      parent: "minecraft:block/cube_all",
      textures: { all: "modules_demo:block/glow" },
    });
  });

  it("dp.blockModel emits under models/block and returns a block: ref", () => {
    const dp = new Datapack("testpack", v26_2);
    const ref = dp.blockModel("glow", Model.cubeAll("testpack:block/glow"));
    expect(ref.id).toBe("testpack:block/glow");
    expect(emitted(dp, "assets/testpack/models/block/glow.json")).toEqual({
      parent: "minecraft:block/cube_all",
      textures: { all: "testpack:block/glow" },
    });
  });

  it("BlockState.variants renders variant models (ModelRef + string)", () => {
    const dp = new Datapack("testpack", v26_2);
    const glow = dp.blockModel("glow", Model.cubeAll("testpack:block/glow"));
    // Blockstate id defaults to the minecraft namespace (it overrides a real block).
    dp.blockState(
      "note_block",
      BlockState.variants({ "note=0": { model: glow, y: 90 } }).variant("note=1", {
        model: "testpack:block/glow",
      }),
    );
    expect(emitted(dp, "assets/minecraft/blockstates/note_block.json")).toEqual({
      variants: {
        "note=0": { model: "testpack:block/glow", y: 90 },
        "note=1": { model: "testpack:block/glow" },
      },
    });
  });

  it("BlockState.part produces a multipart file", () => {
    const dp = new Datapack("testpack", v26_2);
    dp.blockState(
      "mycorp:wire",
      new BlockState().part({ apply: { model: "mycorp:block/wire" } }),
    );
    expect(emitted(dp, "assets/mycorp/blockstates/wire.json")).toEqual({
      multipart: [{ apply: { model: "mycorp:block/wire" } }],
    });
  });
});

describe("Item.model version-aware lowering", () => {
  it("renders the item_model component on 1.21.4+", () => {
    const ref = new ModelRef("testpack:web");
    expect(Item.CARROT_ON_A_STICK.model(ref).render(v1_21_4)).toBe(
      'minecraft:carrot_on_a_stick[item_model="testpack:web"]',
    );
    expect(Item.CARROT_ON_A_STICK.model("testpack:web").render(v26_2)).toContain(
      'item_model="testpack:web"',
    );
  });

  it("falls back to custom_model_data NBT on pre-components versions when a legacy number is given", () => {
    const ref = new ModelRef("testpack:web", 470030);
    expect(Item.CARROT_ON_A_STICK.model(ref).render(v1_20_4)).toBe(
      "minecraft:carrot_on_a_stick{CustomModelData:470030}",
    );
  });

  it("throws on a legacy version when the handle carries no fallback number", () => {
    const ref = new ModelRef("testpack:web");
    expect(() => Item.CARROT_ON_A_STICK.model(ref).render(v1_20_4)).toThrow(
      /predates the item_model component/,
    );
  });
});
