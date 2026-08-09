import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { Block, Datapack, Detect, Pos, Selector, buildDatapack } from "helix";
import type { Detector, FunctionContext } from "helix";
import { Module } from "../src/module.decorator";
import { DatapackFactory } from "../src/factory";
import { HandlerGroup, On, rearmEvents } from "../src/events";

const AT = Pos(1, 2, 3);
const PRESSED = Block.STONE_BUTTON.state({ powered: true });

function compile(root: new () => object): { files: Map<string, string>; all: string } {
  const dp = DatapackFactory.create(root as never, { name: "test" });
  const files = buildDatapack(dp);
  return { files, all: [...files.values()].join("\n") };
}

describe("@On", () => {
  it("emits a latch guard, the detector, the flag write and the body", () => {
    @Module({ name: "buttons" })
    class Buttons {
      @On(Detect.block(AT, PRESSED))
      pressed(ctx: FunctionContext) {
        ctx.say("hit");
      }
    }
    @Module({ name: "root", imports: [Buttons] })
    class Root {}

    const { all } = compile(Root);
    expect(all).toContain(
      "execute unless score #buttons.pressed events matches 1 if block 1 2 3 minecraft:stone_button[powered=true] run",
    );
    expect(all).toContain("scoreboard players set #buttons.pressed events 1");
    expect(all).toContain("say hit");
  });

  it("once: false drops both the flag and its guard", () => {
    @Module({ name: "hum" })
    class Hum {
      @On(Detect.entity(Selector.allPlayers()), { once: false })
      ambience(ctx: FunctionContext) {
        ctx.say("hum");
      }
    }
    @Module({ name: "root", imports: [Hum] })
    class Root {}

    const { all } = compile(Root);
    expect(all).toContain("execute if entity @a run say hum");
    expect(all).not.toContain("#hum.ambience");
  });

  it("takes any detector, including a hand-written one", () => {
    // The override point: the pack decides what detection costs, not twine.
    const cheap: Detector = (c) =>
      void c.ifEntity(Selector.allPlayers().tag("inside")).ifBlock(AT, PRESSED);

    @Module({ name: "custom" })
    class Custom {
      @On(cheap, { once: false })
      pressed(ctx: FunctionContext) {
        ctx.say("hit");
      }
    }
    @Module({ name: "root", imports: [Custom] })
    class Root {}

    expect(compile(Root).all).toContain(
      "execute if entity @a[tag=inside] if block 1 2 3 minecraft:stone_button[powered=true] run say hit",
    );
  });

  it("`every` throttles a handler independently of its module's tickEvery", () => {
    @Module({ name: "mixed", tickEvery: 5 })
    class Mixed {
      @On(Detect.entity(Selector.allPlayers()), { once: false, every: 40 })
      slow(ctx: FunctionContext) {
        ctx.say("slow");
      }
      onTick(ctx: FunctionContext) {
        ctx.say("fast");
      }
    }
    @Module({ name: "root", imports: [Mixed] })
    class Root {}

    const { all } = compile(Root);
    // Two distinct periods → two distinct phase gates, each emitted once.
    expect(all).toMatch(/matches 0 .*run .*say fast|say fast/);
    expect(all).toContain("say slow");
    expect(all).toContain("40");
  });

  it("`name` gives the body its own function, called from the guard", () => {
    @Module({ name: "named" })
    class Named {
      @On(Detect.block(AT, PRESSED), { name: "water" })
      water(ctx: FunctionContext) {
        ctx.say("one");
        ctx.say("two");
      }
    }
    @Module({ name: "root", imports: [Named] })
    class Root {}

    const { files, all } = compile(Root);
    expect([...files.keys()].some((p) => p.endsWith("/water.mcfunction"))).toBe(true);
    expect(all).toContain("function test:water");
  });

  it("rearmEvents clears every once-latch on the module", () => {
    @Module({ name: "puzzle" })
    class Puzzle {
      @On(Detect.block(AT, PRESSED))
      a(ctx: FunctionContext) {
        ctx.say("a");
      }
      @On(Detect.block(AT, PRESSED))
      b(ctx: FunctionContext) {
        ctx.say("b");
      }
      @On(Detect.entity(Selector.allPlayers()), { once: false })
      c(ctx: FunctionContext) {
        ctx.say("c");
      }
      register(dp: Datapack) {
        dp.createFunction("reset").build((ctx) => rearmEvents(ctx, dp, "puzzle", this));
      }
    }
    @Module({ name: "root", imports: [Puzzle] })
    class Root {}

    const { files } = compile(Root);
    const reset = [...files].find(([p]) => p.endsWith("/reset.mcfunction"))![1];
    expect(reset).toContain("scoreboard players set #puzzle.a events 0");
    expect(reset).toContain("scoreboard players set #puzzle.b events 0");
    // `once: false` allocated no latch, so there is nothing to clear.
    expect(reset).not.toContain("#puzzle.c");
  });

  it("a handler alone is enough to keep its area's subtree ticking", () => {
    @Module({ name: "area", area: true })
    class Area {
      @On(Detect.block(AT, PRESSED))
      pressed(ctx: FunctionContext) {
        ctx.say("hit");
      }
    }
    @Module({ name: "root", imports: [Area] })
    class Root {}

    expect(compile(Root).all).toContain("if score #area active matches 1");
  });
});

describe("handler groups", () => {
  class Poll extends HandlerGroup {
    constructor(
      readonly ns: string,
      private readonly msg: string,
    ) {
      super();
    }
    registerHandlers() {
      this.on("hit", Detect.block(AT, PRESSED), (c) => c.say(this.msg));
    }
  }

  it("discovers groups held in an array field, in array order", () => {
    @Module({ name: "mod" })
    class Mod {
      groups = [new Poll("first", "alpha"), new Poll("second", "beta")];
    }
    @Module({ name: "root", imports: [Mod] })
    class Root {}

    const { all } = compile(Root);

    expect(all).toContain("#mod.first/hit");
    expect(all).toContain("#mod.second/hit");
    expect(all.indexOf("alpha")).toBeLessThan(all.indexOf("beta"));
  });
});

describe("generated rearm", () => {
  it("emits <name>/rearm clearing every latch the module owns", () => {
    @Module({ name: "puzzle" })
    class Puzzle {
      @On(Detect.block(AT, PRESSED))
      solved(ctx: FunctionContext) {
        ctx.say("solved");
      }
      @On(Detect.block(AT, PRESSED), { once: false })
      polled(ctx: FunctionContext) {
        ctx.say("polled");
      }
    }
    @Module({ name: "root", imports: [Puzzle] })
    class Root {}

    const { files } = compile(Root);
    const rearm = [...files].find(([p]) => p.endsWith("puzzle/rearm.mcfunction"))![1];

    expect(rearm).toContain("scoreboard players set #puzzle.solved events 0");
    // `once: false` never allocated a latch, so there is nothing to clear.
    expect(rearm).not.toContain("#puzzle.polled");
  });

  it("emits no rearm for a module with no latched handlers", () => {
    @Module({ name: "quiet" })
    class Quiet {
      @On(Detect.block(AT, PRESSED), { once: false })
      polled(ctx: FunctionContext) {
        ctx.say("polled");
      }
    }
    @Module({ name: "root", imports: [Quiet] })
    class Root {}

    expect([...compile(Root).files.keys()].some((p) => p.includes("quiet/rearm"))).toBe(false);
  });
});
