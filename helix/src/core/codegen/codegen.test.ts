import { describe, it, expect, beforeEach, vi } from "vitest";
import { Datapack } from "../ir/datapack";
import { FunctionNode } from "../ir/node";
import { SayNode } from "../commands/saycommand";
import { generateFunction, buildDatapack } from "./codegen";
import { writeDatapack } from "./write";
import { Dispatcher, CodegenContext, CommandHandler } from "../ir/commandhandler";
import { v1_21_4 } from "../../versions/1_21_4";
import fs from "fs";

// Keep the real fs (loadProfile reads version data from disk at import time);
// only spy on the write side that this suite asserts against.
vi.mock("fs", async (importActual) => {
  const actual = await importActual<typeof import("fs")>();
  const mkdirSync = vi.fn();
  const writeFileSync = vi.fn();
  return {
    ...actual,
    mkdirSync,
    writeFileSync,
    default: { ...actual, mkdirSync, writeFileSync },
  };
});

class MockSayHandler extends CommandHandler<SayNode> {
    type: SayNode["type"] = "say";
    generate(node: SayNode, ctx: CodegenContext) {
        ctx.emit(`say ${node.value}`);
    }
}

describe("codegen", () => {
    let dp: Datapack;
    let dispatcher: Dispatcher;

    beforeEach(() => {
        dp = new Datapack("testpack", v1_21_4);
        dispatcher = new Dispatcher(new Map([["say", new MockSayHandler()]]));
    });

    it("generateFunction creates file and registers function", () => {
        const fn = new FunctionNode("main");
        fn.push(new SayNode("hello"));

        const ref = generateFunction(fn, dp, dispatcher);

        expect(dp.files.has("main")).toBe(true);
        expect(dp.functions.has("main")).toBe(true);
        expect(ref).toBe("function testpack:main");
        expect(dp.files.get("main")).toContain("say hello");
    });

    it("generateFunction does not overwrite existing file", () => {
        const fn = new FunctionNode("main");
        dp.files.set("main", "existing");

        const ref = generateFunction(fn, dp, dispatcher);

        expect(ref).toBe("");
        expect(dp.files.get("main")).toBe("existing");
    });

    it("buildDatapack produces mcfunction path and content", () => {
        const fn = new FunctionNode("main");
        fn.push(new SayNode("hello"));
        dp.functions.set("main", fn);

        const files = buildDatapack(dp);

        expect(files.has("data/testpack/function/main.mcfunction")).toBe(true);
        expect(files.get("data/testpack/function/main.mcfunction")).toContain("say hello");
    });

    it("writeDatapack writes files and pack.mcmeta", () => {
        const fn = new FunctionNode("main");
        fn.push(new SayNode("hello"));
        dp.functions.set("main", fn);

        writeDatapack(dp, "/tmp/out");

        expect(fs.mkdirSync).toHaveBeenCalled();
        expect(fs.writeFileSync).toHaveBeenCalled();

        const calls = (fs.writeFileSync as any).mock.calls;
        const mcmetaCall = calls.find((c: any[]) => c[0].includes("pack.mcmeta"));
        expect(mcmetaCall).toBeTruthy();
    });
});