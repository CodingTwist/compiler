import { describe, it, expect } from "vitest";
import { Pos } from "./pos";

describe("Pos", () => {
  it("renders one mode for the whole vector", () => {
    expect(Pos(10, 4, 5).render()).toBe("10 4 5");
    expect(Pos.rel(0, 1, 0).render()).toBe("~ ~1 ~");
    expect(Pos.local(0, 0, 2).render()).toBe("^ ^ ^2");
    expect(Pos.here().render()).toBe("~ ~ ~");
  });

  it("lets a single axis override the vector's mode", () => {
    expect(Pos.rel(0, Pos.abs(0), 0).render()).toBe("~ 0 ~");
    expect(Pos(1, Pos.tilde(2), 3).render()).toBe("1 ~2 3");
    expect(Pos.rel(Pos.caret(1), 0, 0).render()).toBe("^1 ~ ~");
  });

  it("keeps each axis' mode through offset/center", () => {
    expect(Pos.rel(0, Pos.abs(64), 0).offset(1, 1, 1).render()).toBe("~1 65 ~1");
    expect(Pos.rel(0, Pos.abs(64), 0).center().render()).toBe("~0.5 64.5 ~0.5");
  });

  it("pins exact coordinates with a trailing .0", () => {
    expect(Pos.exact(0, 0, 0).render()).toBe("0.0 0.0 0.0");
    expect(Pos.exact(1.5, 2, 3).render()).toBe("1.5 2.0 3.0");
  });

  it("renders raw positions verbatim", () => {
    expect(Pos.raw("~ 0 ~").offset(1, 1, 1).render()).toBe("~ 0 ~");
  });
});
