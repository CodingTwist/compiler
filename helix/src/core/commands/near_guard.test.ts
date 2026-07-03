import { describe, it, expect } from "vitest";
import { NearGuardHandler, NearGuardNode } from "./near_guard";
import { FunctionNode } from "../ir/node";
import { CodegenContext, Dispatcher } from "../ir/commandhandler";
import { Datapack } from "../ir/datapack";
import { createHandlerMap } from "../codegen/codegen";
import { FunctionContext } from "../frontend/context";
import { Selector } from "../frontend/nodes/selector";
import { Pos } from "../values";
import { v1_21_4 } from "../../versions/1_21_4";

function env() {
  const dp = new Datapack("testpack", v1_21_4);
  const dispatcher = new Dispatcher(createHandlerMap());
  const fnCtx = new FunctionContext(new FunctionNode("main"), v1_21_4);
  // Re-emit the captured guard nodes through a CodegenContext to get text.
  const render = () => {
    const out = new CodegenContext(dp, dispatcher);
    const handler = new NearGuardHandler();
    for (const node of fnCtx.fn.nodes) {
      handler.generate(node as NearGuardNode, out);
    }
    return out.lines;
  };
  return { fnCtx, render };
}

describe("whenPlayerNear", () => {
  it("a one-arg builder is a single presence check (`if entity`)", () => {
    const { fnCtx, render } = env();
    fnCtx.whenPlayerNear(Pos(0, 64, 0), 6, (ctx) => {
      ctx.say("near");
    });
    expect(render()).toEqual([
      "execute positioned 0 64 0 if entity @a[distance=..6] run say near",
    ]);
  });

  it("a two-arg builder fans out per player (`as`) with @s bound", () => {
    const { fnCtx, render } = env();
    fnCtx.whenPlayerNear(Pos(0, 64, 0), 6, (ctx, player) => {
      ctx.tellraw(player, "hi");
    });
    expect(render()).toEqual([
      "execute positioned 0 64 0 as @a[distance=..6] run tellraw @s {\"text\":\"hi\"}",
    ]);
  });

  it("keeps the unless guard in both forms", () => {
    const { fnCtx, render } = env();
    const guard = Selector.allEntities().tag("door_open");
    fnCtx.whenPlayerNear(
      Pos(0, 64, 0),
      6,
      (ctx) => ctx.say("once"),
      guard,
    );
    expect(render()[0]).toContain("if entity @a[distance=..6] unless entity");
  });
});
