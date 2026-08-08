import { describe, it, expect } from "vitest";
import { Datapack } from "../ir/datapack";
import { Dispatcher } from "../ir/commandhandler";
import { createHandlerMap } from "../codegen/codegen";
import { generateFunction } from "../ir/generate";
import { FunctionNode } from "../ir/node";
import { FunctionContext } from "../frontend/context";
import { Id, Pos } from "../values";
import { Selector } from "../frontend/nodes/selector";
import { RuntimeTarget } from "../ir/target";
import { v1_21_4 } from "../../versions/profiles";

// Author a function that makes one native op (optionally with a fallback) and
// run codegen, returning the rendered `.mcfunction` text - or throwing if the
// build can't compile it (server-only op on a vanilla build).
function build(target: RuntimeTarget, withFallback: boolean): string {
  const dp = new Datapack("testpack", v1_21_4, target);
  const dispatcher = new Dispatcher(createHandlerMap());
  const fn = new FunctionNode("main");
  const ctx = new FunctionContext(fn, dp.version);

  const call = ctx.native(Id("paper:pathfind"), Selector.allPlayers(), Pos(0, 64, 0));
  if (withFallback) call.fallback((c) => c.say("no server pathfinder"));

  generateFunction(fn, dp, dispatcher);
  return dp.files.get("main") ?? "";
}

describe("native ops", () => {
  it("emits the native plugin call on a paper build (and skips vanilla validation)", () => {
    expect(build("paper", true)).toEqual("paper:pathfind @a 0 64 0");
  });

  it("does not require a fallback on a paper build", () => {
    expect(build("paper", false)).toEqual("paper:pathfind @a 0 64 0");
  });

  it("runs the fallback commands on a vanilla build", () => {
    expect(build("vanilla", true)).toEqual("say no server pathfinder");
  });

  it("throws for a server-only op (no fallback) on a vanilla build", () => {
    expect(() => build("vanilla", false)).toThrow(/server-only/);
  });
});
