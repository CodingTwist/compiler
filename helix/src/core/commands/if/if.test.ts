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
import { buildDatapack } from "../../codegen/codegen";
import { Selector } from "../../frontend/nodes/selector";

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

  it("puts if/else in a branch function so else never sees the then body's changes", () => {
    const { dp, ctx } = createCommandTestEnv();
    const ob = new Objective("health");
    const cond = new ScoreRangeNode("@s", ob, new Range(10,20));
    const node = new IfElseNode(cond, buildBody("then", new SayNode("yes")), [], buildBody("else", new SayNode("no")));
    new IfHandler().generate(node, ctx);
    expect(ctx.lines).toEqual(["function testpack:then_chain"]);
    expect(dp.files.get("then_chain")).toBe(
      "execute if score @s health matches 10..20 run return run say yes\nsay no"
    );
  });

  it("keeps a forking or returning body in its own function under return run", () => {
    const dp = new Datapack("testpack", v1_21_4);
    const flag = dp.objective("flag").score("@s");
    dp.createFunction("f").build((ctx) => {
      ctx
        .if(flag.equal(1), (c) => void c.return_(1))
        .elif(flag.equal(2), (c) => c.execute().as(Selector.allPlayers()).run((b) => b.say("a")))
        .else((c) => c.say("no"));
    });
    buildDatapack(dp);
    const call = dp.files.get("f")!;
    const chain = call.slice(call.indexOf(":") + 1);
    const lines = dp.files.get(chain)!.split("\n");
    expect(lines[0]).toMatch(/matches 1 run return run function testpack:\S+$/);
    expect(lines[1]).toMatch(/matches 2 run return run function testpack:\S+$/);
    expect(lines[2]).toBe("say no");
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

it("checks elif branches in order and stops at the first match", () => {
  const { dp, ctx } = createCommandTestEnv();
  const ob = new Objective("score");
  const cond1 = new ScoreRangeNode("@s", ob, new Range(1));
  const cond2 = new ScoreRangeNode("@s", ob, new Range(2));
  const node = new IfElseNode(
    cond1,
    buildBody("then", new SayNode("one")),
    [{ condition: cond2, body: buildBody("elif1", new SayNode("two")) }],
  );
  new IfHandler().generate(node, ctx);
  expect(ctx.lines).toEqual(["function testpack:then_chain"]);
  expect(dp.files.get("then_chain")).toBe(
    "execute if score @s score matches 1.. run return run say one\n" +
      "execute if score @s score matches 2.. run return run say two",
  );
});

it("an empty then body still stops the else", () => {
  const { dp, ctx } = createCommandTestEnv();
  const ob = new Objective("score");
  const cond = new ScoreCompareNode("@s", ob, "<", "#max", ob);
  const node = new IfElseNode(cond, buildBody("then"), [], buildBody("else", new SayNode("no")));
  new IfHandler().generate(node, ctx);
  expect(dp.files.get("then_chain")).toBe(
    "execute if score @s score < #max score run return 0\nsay no",
  );
});

it("throws on unsupported condition type", () => {
  const { ctx } = createCommandTestEnv();
  const unsupported = { type: "unknown_expr" } as any;
  const node = new IfElseNode(unsupported, buildBody("then", new SayNode("oops")));
  expect(() => new IfHandler().generate(node, ctx)).toThrow("Unsupported condition");
});
