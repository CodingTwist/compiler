import { describe, it, expect } from "vitest";
import { AtEntityHandler, AtEntityNode } from "./at_entity";
import { FunctionNode } from "../ir/node";
import { SayNode } from "./saycommand";
import { Selector } from "../frontend/nodes/selector";
import { CodegenContext, Dispatcher } from "../ir/commandhandler";
import { Datapack } from "../ir/datapack";
import { createHandlerMap } from "../codegen/codegen";
import { v1_21_4 } from "../../versions/1_21_4";

function createCommandTestEnv() {
  const dp = new Datapack("testpack", v1_21_4);
  const dispatcher = new Dispatcher(createHandlerMap());
  const ctx = new CodegenContext(dp, dispatcher);
  return { dp, dispatcher, ctx };
}

function buildBody(name: string, ...nodes: SayNode[]): FunctionNode {
  const fn = new FunctionNode(name);
  nodes.forEach((n) => fn.push(n));
  return fn;
}

describe("AtEntityHandler", () => {
  it("inlines a single-command body straight into the run clause (no child file)", () => {
    const { dp, ctx } = createCommandTestEnv();
    const sel = Selector.allPlayers();
    const body = buildBody("inline_at", new SayNode("hi"));
    new AtEntityHandler().generate(new AtEntityNode(sel, body, "xyz"), ctx);

    expect(ctx.lines).toHaveLength(1);
    expect(ctx.lines[0]).toBe("execute at @a align xyz run say hi");
    expect(dp.files.size).toBe(0);
  });

  it("hoists a multi-command body to ONE child function so the selector is evaluated once", () => {
    const { dp, ctx } = createCommandTestEnv();
    const sel = Selector.allPlayers();
    const body = buildBody("__internal_t_at_0", new SayNode("a"), new SayNode("b"));
    new AtEntityHandler().generate(new AtEntityNode(sel, body, "xyz"), ctx);

    // A single wrapper line - the (potentially expensive) selector runs once.
    expect(ctx.lines).toHaveLength(1);
    expect(ctx.lines[0]).toBe(
      "execute at @a align xyz run function testpack:__internal_t_at_0",
    );
    expect(dp.files.get("__internal_t_at_0")).toBe("say a\nsay b");
  });

  it("omits the align clause when none is given", () => {
    const { ctx } = createCommandTestEnv();
    const sel = Selector.allPlayers();
    const body = buildBody("bare_at", new SayNode("hi"));
    new AtEntityHandler().generate(new AtEntityNode(sel, body), ctx);

    expect(ctx.lines[0]).toBe("execute at @a run say hi");
  });
});
