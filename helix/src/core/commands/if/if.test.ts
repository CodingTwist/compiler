import { describe, it, expect } from "vitest";
import { IfHandler } from ".";
import { ASTNode, FunctionNode, Range } from "../../ir/node";
import { IfElseNode, ScoreCompareNode, ScoreRangeNode } from ".";
import { SayNode } from "../saycommand";
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

describe("IfHandler - ScoreRangeNode", () => {
  it("emits execute if score matches for a range condition", () => {
    const { ctx } = createCommandTestEnv();
    const ob = new Objective("health");
    const cond = new ScoreRangeNode("@s", ob, new Range(10,20));
    const node = new IfElseNode(cond, buildBody("then", new SayNode("in range")));
    new IfHandler().generate(node, ctx);
    // A single-command body is inlined into the `run` clause, no child function.
    expect(ctx.lines[0]).toBe(
      "execute if score @s health matches 10..20 run say in range"
    );
  });

  it("emits execute unless for else branch on range condition", () => {
    const { ctx } = createCommandTestEnv();
    const ob = new Objective("health");
    const cond = new ScoreRangeNode("@s", ob, new Range(10,20));
    const node = new IfElseNode(cond, buildBody("then", new SayNode("yes")), [], buildBody("else", new SayNode("no")));
    new IfHandler().generate(node, ctx);
    expect(ctx.lines[1]).toBe(
      "execute unless score @s health matches 10..20 run say no"
    );
  });

  it("commits a multi-command body to a child function and calls it", () => {
    const { dp, ctx } = createCommandTestEnv();
    const ob = new Objective("health");
    const cond = new ScoreRangeNode("@s", ob, new Range(10, 20));
    const node = new IfElseNode(
      cond,
      buildBody("then", new SayNode("a"), new SayNode("b")),
    );
    new IfHandler().generate(node, ctx);
    expect(ctx.lines[0]).toBe(
      "execute if score @s health matches 10..20 run function testpack:then"
    );
    expect(dp.files.get("then")).toBe("say a\nsay b");
  });
});

describe("IfHandler - ScoreCompareNode", () => {
  const compareOps = ["<", "<=", "=", ">=", ">"] as const;

  it.each(compareOps)("emits correct operator '%s'", (op) => {
    const { ctx } = createCommandTestEnv();
    const obA = new Objective("lives");
    const obB = new Objective("max");
    const cond = new ScoreCompareNode("@s", obA, op, "target", obB);
    const node = new IfElseNode(cond, buildBody("then", new SayNode("yes")));
    new IfHandler().generate(node, ctx);
    expect(ctx.lines[0]).toBe(
      `execute if score @s lives ${op} target max run say yes`
    );
  });
});

it("emits one line per elif branch", () => {
  const { ctx } = createCommandTestEnv();
  const ob = new Objective("score");
  const cond1 = new ScoreRangeNode("@s", ob, new Range(1));
  const cond2 = new ScoreRangeNode("@s", ob, new Range(2));
  const cond3 = new ScoreRangeNode("@s", ob, new Range(3));
  const node = new IfElseNode(
    cond1,
    buildBody("then", new SayNode("one")),
    [
      { condition: cond2, body: buildBody("elif1", new SayNode("two")) },
      { condition: cond3, body: buildBody("elif2", new SayNode("three")) },
    ]
  );
  new IfHandler().generate(node, ctx);
  expect(ctx.lines).toHaveLength(3);
  expect(ctx.lines[1]).toContain("matches 2");
  expect(ctx.lines[2]).toContain("matches 3");
});

it("throws on unsupported condition type", () => {
  const { ctx } = createCommandTestEnv();
  const unsupported = { type: "unknown_expr" } as any;
  const node = new IfElseNode(unsupported, buildBody("then", new SayNode("oops")));
  expect(() => new IfHandler().generate(node, ctx)).toThrow("Unsupported condition");
});
