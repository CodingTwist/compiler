// src/core/frontend/ast.context.test.ts
import { describe, it, expect } from "vitest";
import { FunctionContext } from "./context"; // adjust path
import { Objective } from "./nodes/objective";
import { Player } from "./nodes/player";
import { ExpressionNode, FunctionNode } from "../ir/node";
import { IfElseNode } from "../commands/if";
import { SayNode } from "../commands/saycommand";
import { ScoreboardNode } from "../commands/scoreboard";
import { TellrawNode } from "../commands/tellraw";
import { PlayerGiveNode } from "../commands/give";
import { Text } from "./nodes/text";
import { Score } from "./nodes/score";
import { TellrawText } from "./nodes/tellraw_text";
import { Selector } from "./nodes/selector";
import { Item, ItemValue } from "../values/item";
import { v1_21_4 } from "../../versions/profiles";

describe("FunctionContext", () => {
  it("say() pushes a SayNode", () => {
    const fn = new FunctionNode("main");
    const ctx = new FunctionContext(fn, v1_21_4);

    ctx.say("hello");

    expect(fn.nodes).toHaveLength(1);
    expect(fn.nodes[0]).toBeInstanceOf(SayNode);
    expect((fn.nodes[0] as SayNode).value).toBe("hello");
  });

  it("scoreInit() pushes the objectives-add command", () => {
    const fn = new FunctionNode("main");
    const ctx = new FunctionContext(fn, v1_21_4);
    const obj = new Objective("kills");

    ctx.scoreInit(obj);

    const node = fn.nodes[0] as ScoreboardNode;
    expect(node.spine).toEqual(["objectives", "add"]);
    expect(node.args).toEqual({ objective: "kills", criteria: "dummy" });
  });

  it("scoreSet() pushes the players-set command", () => {
    const fn = new FunctionNode("main");
    const ctx = new FunctionContext(fn, v1_21_4);
    const obj = new Objective("kills");

    const score = new Score(obj, "player", 5);
    ctx.scoreSet(score);

    const node = fn.nodes[0] as ScoreboardNode;
    expect(node.spine).toEqual(["players", "set"]);
    expect(node.args).toEqual({ targets: "player", objective: "kills", score: 5 });
  });

  it("tellraw() pushes a TellrawNode", () => {
    const fn = new FunctionNode("main");
    const ctx = new FunctionContext(fn, v1_21_4);
    const text = new Text("hi");
    const message = new TellrawText([text]);

    ctx.tellraw(Selector.allPlayers(), message);

    expect(fn.nodes[0]).toBeInstanceOf(TellrawNode);
    const node = fn.nodes[0] as TellrawNode;
    expect(node.target.base).toBe("@a");
    expect(node.message).toBe(message);
  });

  it("playerGive() pushes a PlayerGiveNode", () => {
    const fn = new FunctionNode("main");
    const ctx = new FunctionContext(fn, v1_21_4);
    const player = new Player(fn, "Steve");

    ctx.playerGive(player, Item("diamond"), 3);

    expect(fn.nodes[0]).toBeInstanceOf(PlayerGiveNode);
    const node = fn.nodes[0] as PlayerGiveNode;
    expect(node.target.base).toBe("Steve");
    // node.item is now the rich single-source Item.
    const item = node.item as ItemValue;
    expect(item.getCount()).toBe(3);
    expect(item.baseId()).toBe("minecraft:diamond");
  });

  it("if() builds IfElseNode with nested FunctionNode", () => {
    const fn = new FunctionNode("main");
    const ctx = new FunctionContext(fn, v1_21_4);

    // dummy ExpressionNode for test
    const cond: ExpressionNode = { type: "dummy" } as ExpressionNode;

    ctx
      .if(cond, (ctx) => {
        ctx.say("inside if");
      })
      .elif(cond, (ctx) => {
        ctx.say("inside elif");
        ctx.say("another value");
      })
      .else((ctx) => {
        ctx.say("inside else");
      });

    expect(fn.nodes[0]).toBeInstanceOf(IfElseNode);
    const node = fn.nodes[0] as IfElseNode;

    expect(node.thenBody.nodes[0]).toBeInstanceOf(SayNode);

    const sayThen = node.thenBody.nodes[0] as SayNode;
    expect(sayThen.value).toBe("inside if");

    expect(node.elifs[0].body.nodes[0]).toBeInstanceOf(SayNode);

    const sayElif = node.elifs[0].body.nodes[0] as SayNode;
    const sayElif2 = node.elifs[0].body.nodes[1] as SayNode;
    expect(sayElif.value).toBe("inside elif");
    expect(sayElif2.value).toBe("another value");

  });
});
