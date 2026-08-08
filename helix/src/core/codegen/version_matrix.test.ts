import { describe, it, expect } from "vitest";
import { Datapack } from "../ir/datapack";
import { ASTNode, FunctionNode } from "../ir/node";
import { ItemSpec, PlayerGiveNode } from "../commands/give";
import { RandomValueNode } from "../commands/random";
import { Selector } from "../frontend/nodes/selector";
import { buildDatapack } from "./codegen";
import { VersionProfile } from "../../versions/profile";
import { v1_21_4 } from "../../versions/profiles";
import { v1_20_4 } from "../../versions/profiles";
import { v1_20_1 } from "../../versions/profiles";

// Author one function, then compile it against a chosen version.
function buildAgainst(version: VersionProfile, nodes: ASTNode[]) {
  const dp = new Datapack("pack", version);
  const fn = new FunctionNode("main");
  nodes.forEach((n) => fn.push(n));
  dp.functions.set("main", fn);
  return buildDatapack(dp);
}

function giveSword(): PlayerGiveNode {
  const item: ItemSpec = {
    id: "minecraft:diamond_sword",
    count: 1,
    customModelData: 7,
  };
  return new PlayerGiveNode(Selector.allPlayers().build(), item);
}

describe("same source, different version", () => {
  it("emits singular folders for 1.21.4 and plural for 1.20.x", () => {
    const modern = buildAgainst(v1_21_4, [giveSword()]);
    const legacy = buildAgainst(v1_20_4, [giveSword()]);

    expect(modern.has("data/pack/function/main.mcfunction")).toBe(true);
    expect(legacy.has("data/pack/functions/main.mcfunction")).toBe(true);
  });

  it("lowers the same give to components (1.21.4) vs NBT (1.20.1)", () => {
    const modern = buildAgainst(v1_21_4, [giveSword()]).get(
      "data/pack/function/main.mcfunction",
    );
    const legacy = buildAgainst(v1_20_1, [giveSword()]).get(
      "data/pack/functions/main.mcfunction",
    );

    expect(modern).toContain(
      "give @a minecraft:diamond_sword[custom_model_data={floats:[7]}] 1",
    );
    expect(legacy).toContain(
      "give @a minecraft:diamond_sword{CustomModelData:7} 1",
    );
  });

  it("rejects a command the target version does not have", () => {
    // `random` was added in 1.20.3.
    expect(() => buildAgainst(v1_20_1, [new RandomValueNode(1, 6)])).toThrow(
      /Unknown command "random" for Minecraft 1\.20\.1/,
    );
    expect(() =>
      buildAgainst(v1_21_4, [new RandomValueNode(1, 6)]),
    ).not.toThrow();
  });

  it("validates the same item against each version's registry", () => {
    const bad = () =>
      new PlayerGiveNode(Selector.allPlayers().build(), {
        id: "minecraft:mace", // added in 1.21
      });

    expect(() => buildAgainst(v1_21_4, [bad()])).not.toThrow();
    expect(() => buildAgainst(v1_20_1, [bad()])).toThrow(
      /minecraft:mace.*1\.20\.1/,
    );
  });
});
