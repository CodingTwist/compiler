import { describe, it, expect } from "vitest";
import { Attribute, DamageType, Datapack, Id, Selector } from "../../index";
import { v26_2 } from "../../versions/profiles";
import { buildDatapack } from "../codegen/codegen";

/** The rendered body of one function built with `body`. */
function build(
  body: Parameters<ReturnType<Datapack["createFunction"]>["build"]>[0],
): string {
  const dp = new Datapack("t", v26_2);
  dp.public("f").build(body);
  return buildDatapack(dp).get("data/t/function/f.mcfunction")!.trim();
}

describe("single-target arguments", () => {
  it("throws on a selector that can pick many, and allows one that picks one", () => {
    expect(() =>
      build(
        (ctx) =>
          void ctx
            .damage()
            .by(
              Selector.allPlayers(),
              2,
              DamageType.MOB_ATTACK,
              Selector.self(),
            ),
      ),
    ).toThrow("`damage` takes one entity");
    expect(
      build(
        (ctx) =>
          void ctx
            .damage()
            .by(
              Selector.allEntities().limit(1),
              2,
              DamageType.MOB_ATTACK,
              Selector.nearest(),
            ),
      ),
    ).toBe("damage @e[limit=1] 2 minecraft:mob_attack by @p");
  });
});

describe("ctx.setModifier", () => {
  it("removes the modifier before adding it", () => {
    expect(
      build((ctx) =>
        ctx.setModifier(
          Selector.self(),
          Attribute.MOVEMENT_SPEED,
          Id("t:speed"),
          0.2,
          "add_multiplied_base",
        ),
      ),
    ).toBe(
      "attribute @s minecraft:movement_speed modifier remove t:speed\nattribute @s minecraft:movement_speed modifier add t:speed 0.2 add_multiplied_base",
    );
  });
});
