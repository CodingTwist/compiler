import { describe, it, expect } from "vitest";
import { arg, buildCommand, buildTokens, lit, raw } from "./command-builder";
import { v1_21_4 } from "../../versions/profiles";
import { v1_20_1 } from "../../versions/profiles";

describe("buildCommand (named args, order from the tree)", () => {
  it("emits arguments in the tree's order, not the caller's key order", () => {
    // Keys deliberately scrambled; output must still be target objective score.
    expect(
      buildCommand(v1_21_4, ["scoreboard", "players", "set"], {
        score: 5,
        objective: "obj",
        targets: "@s",
      }),
    ).toBe("scoreboard players set @s obj 5");
  });

  it("stops at the first optional slot the caller omits", () => {
    // `scoreboard objectives add` also accepts an optional displayName.
    expect(
      buildCommand(v1_21_4, ["scoreboard", "objectives", "add"], {
        objective: "kills",
        criteria: "dummy",
      }),
    ).toBe("scoreboard objectives add kills dummy");
  });

  it("throws when the command does not exist in the version", () => {
    expect(() =>
      buildCommand(v1_20_1, ["random", "value"], { range: "1..6" }),
    ).toThrow(/Unknown command "random" for Minecraft 1\.20\.1/);
  });

  it("throws for an argument name that matches no slot", () => {
    expect(() =>
      buildCommand(v1_21_4, ["scoreboard", "players", "set"], {
        targets: "@s",
        objective: "obj",
        bogus: 5,
      }),
    ).toThrow(/Unknown argument\(s\) "bogus"/);
  });

  it("throws when a required argument is omitted (not executable)", () => {
    expect(() =>
      buildCommand(v1_21_4, ["scoreboard", "players", "set"], {
        targets: "@s",
        objective: "obj",
      }),
    ).toThrow(/missing required arguments/);
  });
});

describe("buildTokens (manual, for interleaved / run tails)", () => {
  it("interleaves literals after arguments (trigger ... set)", () => {
    expect(
      buildTokens(v1_21_4, [lit("trigger"), arg("foo"), lit("set"), arg(5)]),
    ).toBe("trigger foo set 5");
  });

  it("appends a raw tail without validating it (execute ... run)", () => {
    expect(
      buildTokens(v1_21_4, [
        lit("execute"),
        lit("as"),
        arg("@s"),
        raw("run say hi"),
      ]),
    ).toBe("execute as @s run say hi");
  });

  it("throws for an unknown sub-command keyword", () => {
    expect(() =>
      buildTokens(v1_21_4, [lit("random"), lit("bogus"), arg("1..18")]),
    ).toThrow(/Unknown sub-command "bogus" for Minecraft 1\.21\.4/);
  });
});
