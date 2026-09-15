import { describe, it, expect } from "vitest";
import { IfHandler } from ".";
import { ASTNode, FunctionNode, Range } from "../../ir/node";
import { IfElseNode, ScoreRangeNode } from ".";
import { SayNode } from "../saycommand";
import { EntityGuardNode } from "../entity_guard";
import { NearGuardNode } from "../near_guard";
import { Selector } from "../../frontend/nodes/selector";
import { Pos } from "../../values";
import { CodegenContext, Dispatcher } from "../../ir/commandhandler";
import { Datapack } from "../../ir/datapack";
import { createHandlerMap } from "../../codegen/codegen";
import { Objective } from "../../frontend";
import { v1_21_4 } from "../../../versions/profiles";

function createCommandTestEnv() {
  const dp = new Datapack("testpack", v1_21_4);
  const dispatcher = new Dispatcher(createHandlerMap());
  const ctx = new CodegenContext(dp, dispatcher);
  return { dp, dispatcher, ctx };
}

function buildBody(name: string, ...nodes: ASTNode[]): FunctionNode {
  const fn = new FunctionNode(name);
  nodes.forEach((n) => fn.push(n));
  return fn;
}

describe("IfHandler - nested if chains", () => {
  it("flattens a nested if-only chain into one multi-condition execute, with no intermediate function", () => {
    const { dp, ctx } = createCommandTestEnv();
    const ob = new Objective("score");
    const condA = new ScoreRangeNode("@s", ob, new Range(0, 0));
    const condB = new ScoreRangeNode("@s", ob, new Range(1, 1));
    const inner = new IfElseNode(
      condB,
      buildBody("inner_then", new SayNode("a"), new SayNode("b")),
    );
    const outer = new IfElseNode(condA, buildBody("outer_then", inner));
    new IfHandler().generate(outer, ctx);

    expect(ctx.lines).toHaveLength(1);
    expect(ctx.lines[0]).toBe(
      "execute if score @s score matches 0 if score @s score matches 1 run function testpack:inner_then",
    );
    // The intermediate single-node "outer_then" body never becomes a file/function.
    expect(dp.files.has("outer_then")).toBe(false);
    expect(dp.files.get("inner_then")).toBe("say a\nsay b");
  });

  it("flattens a nested if-only chain down to a fully inlined single-command body", () => {
    const { dp, ctx } = createCommandTestEnv();
    const ob = new Objective("score");
    const condA = new ScoreRangeNode("@s", ob, new Range(0, 0));
    const condB = new ScoreRangeNode("@s", ob, new Range(1, 1));
    const inner = new IfElseNode(
      condB,
      buildBody("inner_then", new SayNode("hi")),
    );
    const outer = new IfElseNode(condA, buildBody("outer_then", inner));
    new IfHandler().generate(outer, ctx);

    expect(ctx.lines).toHaveLength(1);
    expect(ctx.lines[0]).toBe(
      "execute if score @s score matches 0 if score @s score matches 1 run say hi",
    );
    expect(dp.files.size).toBe(0);
  });

  it("does not flatten when the inner if has an elif or else", () => {
    const { dp, ctx } = createCommandTestEnv();
    const ob = new Objective("score");
    const condA = new ScoreRangeNode("@s", ob, new Range(0, 0));
    const condB = new ScoreRangeNode("@s", ob, new Range(1, 1));
    const inner = new IfElseNode(
      condB,
      buildBody("inner_then", new SayNode("hi")),
      [],
      buildBody("inner_else", new SayNode("bye")),
    );
    const outer = new IfElseNode(condA, buildBody("outer_then", inner));
    new IfHandler().generate(outer, ctx);

    // Not flattened: the inner if+else becomes its own branch function.
    expect(ctx.lines[0]).toBe(
      "execute if score @s score matches 0 run function testpack:inner_then_chain",
    );
    expect(dp.files.get("inner_then_chain")).toBe(
      "execute if score @s score matches 1 run return run say hi\n" + "say bye",
    );
  });

  it("flattens an entity guard nested inside an if-body into one execute with if + entity", () => {
    const { dp, ctx } = createCommandTestEnv();
    const ob = new Objective("score");
    const condA = new ScoreRangeNode("@s", ob, new Range(0, 0));
    const selector = Selector.allPlayers();
    const guard = new EntityGuardNode("if", selector, new SayNode("hi"));
    const outer = new IfElseNode(condA, buildBody("outer_then", guard));
    new IfHandler().generate(outer, ctx);

    expect(ctx.lines).toHaveLength(1);
    expect(ctx.lines[0]).toBe(
      "execute if score @s score matches 0 if entity @a[limit=1] run say hi",
    );
    expect(dp.files.size).toBe(0);
  });

  it("flattens an if nested inside an entity guard's command", () => {
    const { dp, ctx } = createCommandTestEnv();
    const ob = new Objective("score");
    const condA = new ScoreRangeNode("@s", ob, new Range(0, 0));
    const selector = Selector.allPlayers();
    const inner = new IfElseNode(
      condA,
      buildBody("inner_then", new SayNode("hi")),
    );
    const guard = new EntityGuardNode("if", selector, inner);
    const ctxWrapper = new IfElseNode(
      new ScoreRangeNode("@s", ob, new Range(1, 1)),
      buildBody("wrapper_then", guard),
    );
    new IfHandler().generate(ctxWrapper, ctx);

    expect(ctx.lines).toHaveLength(1);
    expect(ctx.lines[0]).toBe(
      "execute if score @s score matches 1 if entity @a[limit=1] if score @s score matches 0 run say hi",
    );
    expect(dp.files.size).toBe(0);
  });

  it("flattens a near-player guard nested inside an if-body (the vault sphere-trigger case)", () => {
    const { dp, ctx } = createCommandTestEnv();
    const ob = new Objective("score");
    const condA = new ScoreRangeNode("@s", ob, new Range(0, 0));
    const guard = new NearGuardNode(
      Pos(0, 64, 0),
      6,
      undefined,
      new SayNode("hi"),
    );
    const outer = new IfElseNode(condA, buildBody("outer_then", guard));
    new IfHandler().generate(outer, ctx);

    expect(ctx.lines).toHaveLength(1);
    expect(ctx.lines[0]).toBe(
      "execute if score @s score matches 0 positioned 0 64 0 if entity @a[distance=..6,limit=1] run say hi",
    );
    expect(dp.files.size).toBe(0);
  });

  it("keeps a near-player guard's unless-guard when folded into the chain", () => {
    const { dp, ctx } = createCommandTestEnv();
    const ob = new Objective("score");
    const condA = new ScoreRangeNode("@s", ob, new Range(0, 0));
    const rearm = Selector.allEntities().tag("door_open");
    const guard = new NearGuardNode(Pos(0, 64, 0), 6, rearm, new SayNode("hi"));
    const outer = new IfElseNode(condA, buildBody("outer_then", guard));
    new IfHandler().generate(outer, ctx);

    expect(ctx.lines).toHaveLength(1);
    expect(ctx.lines[0]).toContain(
      "if entity @a[distance=..6,limit=1] unless entity",
    );
    expect(dp.files.size).toBe(0);
  });
});
