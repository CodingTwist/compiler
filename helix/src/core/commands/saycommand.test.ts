import { CodegenContext, Dispatcher } from "../ir/commandhandler";
import { SayNode } from "./saycommand";
import { createHandlerMap } from "../codegen/codegen";
import { Datapack } from "../ir/datapack";
import { describe, it, expect } from "vitest";
import { SayCommand } from "./saycommand";
import { v1_21_4 } from "../../versions/1_21_4";

function createCommandTestEnv() {
  const dp = new Datapack("testpack", v1_21_4);
  const dispatcher = new Dispatcher(createHandlerMap());
  const ctx = new CodegenContext(dp, dispatcher);
  return { dp, dispatcher, ctx };
}

describe("SayCommand", () => {
  const cases = [
    { value: "hello", expected: "say hello" },
    { value: "hi there", expected: "say hi there" },
    { value: "", expected: "say " },
  ];

  it.each(cases)("generates say command %#", ({ value, expected }) => {
    const { ctx } = createCommandTestEnv();
    const command = new SayCommand();
    const node = new SayNode(value);
    command.generate(node, ctx);
    expect(ctx.lines[0]).toEqual(expected);
  });

  it("emits exactly one line", () => {
    const { ctx } = createCommandTestEnv();
    const command = new SayCommand();
    command.generate(new SayNode("hello"), ctx);
    expect(ctx.lines).toHaveLength(1);
  });

});