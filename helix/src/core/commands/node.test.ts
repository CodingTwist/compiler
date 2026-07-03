import { describe, it, expect } from "vitest";
import { FunctionNode } from "../ir/node";
import { SayNode } from "./saycommand";

describe("FunctionNode", () => {
  it("pushes nodes", () => {
    const fn = new FunctionNode("main");
    const say = new SayNode("hello");
    fn.push(say);
    expect(fn.nodes).toHaveLength(1);
    expect(fn.nodes[0]).toBe(say);
  });
});