import { describe, it, expect } from "vitest";
import { ExecuteAsNode } from "./execute_as";
import { ASTNode, FunctionNode } from "../ir/node";
import { Selector } from "../frontend/nodes/selector";
import { CodegenContext, Dispatcher } from "../ir/commandhandler";
import { Datapack } from "../ir/datapack";
import { createHandlerMap } from "../codegen/codegen";
import { FunctionContext } from "../frontend/context";
import { v1_21_4 } from "../../versions/1_21_4";

function env() {
  const dp = new Datapack("testpack", v1_21_4);
  const dispatcher = new Dispatcher(createHandlerMap());
  const ctx = new CodegenContext(dp, dispatcher);
  return { dp, dispatcher, ctx };
}

/** Capture the single command node a frontend builder emits. */
function nodeOf(build: (ctx: FunctionContext) => void): ASTNode {
  const fn = new FunctionNode("__scratch");
  build(new FunctionContext(fn, v1_21_4));
  return fn.nodes[0];
}

describe("ExecuteAsHandler - as @s folding", () => {
  it("folds `as <sel> run kill @s` into `kill <sel>`", () => {
    const { dispatcher, ctx } = env();
    const inner = nodeOf((c) => c.kill(Selector.self()));
    const sel = Selector.allEntities().tag("hider").build();
    dispatcher.dispatch(new ExecuteAsNode(sel, inner), ctx);
    expect(ctx.lines).toEqual(["kill @e[tag=hider]"]);
  });

  it("folds `as <sel> run tag @s add x` into `tag <sel> add x`", () => {
    const { dispatcher, ctx } = env();
    const inner = nodeOf((c) => c.tag().add(Selector.self(), "frozen"));
    const sel = Selector.allEntities().tag("mob").build();
    dispatcher.dispatch(new ExecuteAsNode(sel, inner), ctx);
    expect(ctx.lines).toEqual(["tag @e[tag=mob] add frozen"]);
  });

  it("does NOT fold a non-whitelisted command (keeps execute as ... run)", () => {
    const { dispatcher, ctx } = env();
    // `clear` is not on the multi-target whitelist, so it stays wrapped.
    const inner = nodeOf((c) => c.clear(Selector.self()));
    const sel = Selector.allEntities().tag("mob").build();
    dispatcher.dispatch(new ExecuteAsNode(sel, inner), ctx);
    expect(ctx.lines[0]).toBe("execute as @e[tag=mob] run clear @s");
  });

  it("does NOT fold when @s carries its own predicate block", () => {
    const { dispatcher, ctx } = env();
    const inner = nodeOf((c) =>
      c.kill(Selector.self().tag("dead")),
    );
    const sel = Selector.allEntities().tag("mob").build();
    dispatcher.dispatch(new ExecuteAsNode(sel, inner), ctx);
    expect(ctx.lines[0]).toBe("execute as @e[tag=mob] run kill @s[tag=dead]");
  });
});
