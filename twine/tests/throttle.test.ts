import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { buildDatapack, Selector } from "helix";
import { Module } from "../src/module.decorator";
import { DatapackFactory } from "../src/factory";

function compile(root: new () => object): { tick: string; clock: string } {
  const dp = DatapackFactory.create(root as never, { name: "test", env: "dev" });
  const files = buildDatapack(dp);
  const find = (suffix: string) =>
    [...files].find(([p]) => p.endsWith(suffix))?.[1] ?? "";
  return { tick: find("/tick.mcfunction"), clock: find("zzz/clock.mcfunction") };
}

describe("tick throttling + staggering", () => {
  it("gates a tickEvery module's onTick behind the period counter", () => {
    @Module({ name: "slow", tickEvery: 20 })
    class Slow {
      onTick(ctx: any) {
        ctx.tellraw(Selector.allPlayers(), "slow");
      }
    }
    @Module({ imports: [Slow], name: "root" })
    class Root {}

    const { tick, clock } = compile(Root);
    // The body runs behind a clock-counter check, not every tick.
    expect(tick).toContain("score t20 clock matches");
    // The shared period counter driver is installed.
    expect(clock).toContain("scoreboard players add t20 clock 1");
  });

  it("auto-assigns distinct phases to siblings sharing a period", () => {
    @Module({ name: "a", tickEvery: 20 })
    class A {
      onTick(ctx: any) {
        ctx.tellraw(Selector.allPlayers(), "a");
      }
    }
    @Module({ name: "b", tickEvery: 20 })
    class B {
      onTick(ctx: any) {
        ctx.tellraw(Selector.allPlayers(), "b");
      }
    }
    @Module({ imports: [A, B], name: "root" })
    class Root {}

    const { tick } = compile(Root);
    // First sibling fires at phase 0, second at phase 1 - different ticks.
    expect(tick).toContain("score t20 clock matches 0");
    expect(tick).toContain("score t20 clock matches 1");
  });

  it("leaves an un-throttled module running every tick", () => {
    @Module({ name: "fast" })
    class Fast {
      onTick(ctx: any) {
        ctx.tellraw(Selector.allPlayers(), "fast");
      }
    }
    @Module({ imports: [Fast], name: "root" })
    class Root {}

    const { tick } = compile(Root);
    expect(tick).not.toContain("clock matches");
  });
});
