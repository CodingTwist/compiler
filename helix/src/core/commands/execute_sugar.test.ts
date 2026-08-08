// The two named shortcuts over `ctx.execute()` - `atEntity` (anchor a body at a
// selector) and `whenItems` (guard a body on one inventory slot). Both used to be
// their own node + handler; they are now clauses on the general chain.
import { describe, it, expect } from "vitest";
import { Datapack, Selector, Item, Slot } from "../../index";
import { v1_21_4 } from "../../versions/profiles";
import { buildDatapack } from "../codegen/codegen";

function render(build: (ctx: any) => void) {
  const dp = new Datapack("testpack", v1_21_4);
  dp.createFunction("f").build(build);
  buildDatapack(dp);
  return { dp, lines: dp.files.get("f")!.split("\n") };
}

describe("ctx.atEntity", () => {
  it("inlines a single-command body straight into the run clause (no child file)", () => {
    const { dp, lines } = render((ctx) =>
      ctx.atEntity(Selector.allPlayers(), (c: any) => c.say("hi"), "xyz"),
    );
    expect(lines).toEqual(["execute at @a align xyz run say hi"]);
    // Only the authored function itself - no child file for the body.
    expect(dp.files.size).toBe(1);
  });

  it("hoists a multi-command body to ONE child function so the selector is evaluated once", () => {
    const { dp, lines } = render((ctx) =>
      ctx.atEntity(Selector.allPlayers(), (c: any) => {
        c.say("a");
        c.say("b");
      }),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^execute at @a run function testpack:/);
    const child = [...dp.files.entries()].find(([name]) => name !== "f")!;
    expect(child[1]).toBe("say a\nsay b");
  });

  it("omits the align clause when none is given", () => {
    const { lines } = render((ctx) =>
      ctx.atEntity(Selector.allPlayers(), (c: any) => c.say("hi")),
    );
    expect(lines[0]).toBe("execute at @a run say hi");
  });
});

describe("ctx.whenItems", () => {
  it("guards a single slot by item predicate", () => {
    const { lines } = render((ctx) =>
      ctx.whenItems(Selector.self(), Slot.hotbar(0), Item.LANTERN, (c: any) =>
        c.item().replaceEntityWith(Selector.self(), Slot.hotbar(0), Item.SOUL_LANTERN),
      ),
    );
    expect(lines).toEqual([
      "execute if items entity @s hotbar.0 minecraft:lantern run item replace entity @s hotbar.0 with minecraft:soul_lantern",
    ]);
  });

  it("matches the item's full components (name/model/lore), so a plain item won't trip it", () => {
    const tagged = Item.LANTERN.named("Time Lantern").modelData(7);
    const { lines } = render((ctx) =>
      ctx.whenItems(Selector.self(), Slot.OFFHAND, tagged, (c: any) => c.say("hit")),
    );
    expect(lines[0]).toContain("if items entity @s weapon.offhand minecraft:lantern[");
    expect(lines[0]).toContain("custom_model_data={floats:[7]}");
    expect(lines[0]).toContain('custom_name={"text":"Time Lantern"}');
  });

  it("supports unless mode", () => {
    const { lines } = render((ctx) =>
      ctx.whenItems(
        Selector.self(),
        Slot.MAINHAND,
        Item.LANTERN,
        (c: any) => c.say("empty-ish"),
        "unless",
      ),
    );
    expect(lines[0]).toContain("execute unless items entity @s weapon.mainhand");
  });
});
