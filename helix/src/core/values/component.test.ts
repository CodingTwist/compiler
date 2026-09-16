import { describe, expect, it } from "vitest";
import { Component } from "./component";
import { text } from "../frontend/nodes/text";
import { Color } from "./enums";

describe("Component", () => {
  it("renders a plain string as {text}", () => {
    expect(Component("hi").render(undefined as never)).toBe('{"text":"hi"}');
  });

  it("renders a styled part", () => {
    expect(
      Component(text("hi").bold().color(Color.GOLD)).render(undefined as never),
    ).toBe('{"text":"hi","bold":true,"color":"gold"}');
  });
});
