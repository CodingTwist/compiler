import { describe, it, expect } from "vitest";
import { validateCommand } from "./command-validator";
import { v1_21_4 } from "../../versions/profiles";
import { v1_20_1 } from "../../versions/profiles";

describe("validateCommand", () => {
  it("accepts a valid command and sub-command path", () => {
    expect(() =>
      validateCommand("scoreboard players set @s obj 5", v1_21_4),
    ).not.toThrow();
    expect(() => validateCommand("say hello", v1_21_4)).not.toThrow();
    expect(() =>
      validateCommand("execute as @s at @s run say hi", v1_21_4),
    ).not.toThrow();
  });

  it("does not false-positive on arguments that span whitespace", () => {
    // tellraw's JSON contains spaces and braces; must not be parsed as literals.
    expect(() =>
      validateCommand(
        'tellraw @a {"text":"hello there","bold":true}',
        v1_21_4,
      ),
    ).not.toThrow();
  });

  it("throws for a command that does not exist in the version", () => {
    // `random` was added in 1.20.3; 1.20.1 does not have it.
    expect(() => validateCommand("random value 1..6", v1_20_1)).toThrow(
      /Unknown command "random" for Minecraft 1\.20\.1/,
    );
    expect(() => validateCommand("random value 1..6", v1_21_4)).not.toThrow();
  });

  it("throws for an unknown sub-command keyword", () => {
    expect(() =>
      validateCommand("scoreboard players bogus @s obj 5", v1_21_4),
    ).toThrow(/Unknown sub-command "bogus" for Minecraft 1\.21\.4/);
  });

  it("skips comments and blank lines", () => {
    expect(() => validateCommand("# a comment", v1_21_4)).not.toThrow();
    expect(() => validateCommand("   ", v1_21_4)).not.toThrow();
  });
});
