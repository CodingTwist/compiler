import { describe, it, expect } from "vitest";
import { ItemsGuardHandler, ItemsGuardNode } from "./items_guard";
import { FunctionNode } from "../ir/node";
import { CodegenContext, Dispatcher } from "../ir/commandhandler";
import { Datapack } from "../ir/datapack";
import { createHandlerMap } from "../codegen/codegen";
import { FunctionContext } from "../frontend/context";
import { Selector } from "../frontend/nodes/selector";
import { Item, Slot } from "../values";
import { v1_21_4 } from "../../versions/1_21_4";

function env() {
  const dp = new Datapack("testpack", v1_21_4);
  const dispatcher = new Dispatcher(createHandlerMap());
  const fnCtx = new FunctionContext(new FunctionNode("main"), v1_21_4);
  const render = () => {
    const out = new CodegenContext(dp, dispatcher);
    const handler = new ItemsGuardHandler();
    for (const node of fnCtx.fn.nodes) {
      handler.generate(node as ItemsGuardNode, out);
    }
    return out.lines;
  };
  return { fnCtx, render };
}

describe("whenItems", () => {
  it("guards a single slot by item predicate, one line per command", () => {
    const { fnCtx, render } = env();
    fnCtx.whenItems(Selector.self(), Slot.hotbar(0), Item.LANTERN, (ctx) => {
      ctx.item().replaceEntityWith(Selector.self(), Slot.hotbar(0), Item.SOUL_LANTERN);
    });
    expect(render()).toEqual([
      "execute if items entity @s hotbar.0 minecraft:lantern run item replace entity @s hotbar.0 with minecraft:soul_lantern",
    ]);
  });

  it("matches the item's full components (name/model/lore), so a plain item won't trip it", () => {
    const { fnCtx, render } = env();
    const tagged = Item.LANTERN.named("Time Lantern").modelData(7);
    fnCtx.whenItems(Selector.self(), Slot.OFFHAND, tagged, (ctx) => ctx.say("hit"));
    const line = render()[0];
    expect(line).toContain("if items entity @s weapon.offhand minecraft:lantern[");
    expect(line).toContain("custom_model_data={floats:[7]}");
    expect(line).toContain('custom_name={"text":"Time Lantern"}');
  });

  it("supports unless mode", () => {
    const { fnCtx, render } = env();
    fnCtx.whenItems(
      Selector.self(),
      Slot.MAINHAND,
      Item.LANTERN,
      (ctx) => ctx.say("empty-ish"),
      "unless",
    );
    expect(render()[0]).toContain("execute unless items entity @s weapon.mainhand");
  });
});
