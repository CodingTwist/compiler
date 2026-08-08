import { describe, it, expect } from "vitest";
import { FunctionContext } from "./context";
import "../commands"; // install the ctx.<command>() prototype augmentations
import { FunctionNode } from "../ir/node";
import { v1_20_1 } from "../../versions/profiles";
import { v1_21_4 } from "../../versions/profiles";

// `random` was added in 1.20.3. The frontend gates on the target version, so
// authoring `ctx.random(...)` against an older target throws at the call site -
// not at codegen.
describe("frontend capability gating", () => {
  const ctxFor = (v: typeof v1_21_4) =>
    new FunctionContext(new FunctionNode("main"), v);

  it("rejects ctx.random() on a version without the command (1.20.1)", () => {
    expect(() => ctxFor(v1_20_1).random(1, 6)).toThrow(
      /random.*not available in Minecraft 1\.20\.1/s,
    );
  });

  it("allows ctx.random() on a version that has it (1.21.4)", () => {
    expect(() => ctxFor(v1_21_4).random(1, 6)).not.toThrow();
  });
});
