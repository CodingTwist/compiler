import { describe, it, expect } from "vitest";
import { quat } from "helix";
import { resolveGesture } from "../src/mob/gesture";

const TICK_EVERY = 1;

describe("resolveGesture", () => {
  it("a one-step gesture drops on the very next poll, ignoring its own hold", () => {
    const g = resolveGesture("bob", { members: [0], pivot: [0, 0, 0], rotate: quat("x", 8), rise: 5 }, TICK_EVERY);
    expect(g.sequenced).toBe(false);
    expect(g.schedule.at(-1)).toEqual({ poll: 1, q: undefined, duration: 4 }); // default fall
  });

  it("a sequenced gesture holds the first pose for rise-1 polls before stepping", () => {
    const g = resolveGesture(
      "whirl",
      { members: [0], pivot: [0, 0, 0], rotate: [quat("y", 90), quat("y", 180)], rise: 5, cooldown: 20 },
      TICK_EVERY,
    );
    expect(g.sequenced).toBe(true);
    // hold = max(0, rise-1) = 4; the second step lands at hold+1
    expect(g.schedule[1]).toMatchObject({ poll: 5, q: quat("y", 180) });
  });

  it("linger forces sequencing even for a single-step rotate", () => {
    const g = resolveGesture(
      "slam",
      { members: [0], pivot: [0, 0, 0], rotate: quat("z", 90), linger: 10, cooldown: 30 },
      TICK_EVERY,
    );
    expect(g.sequenced).toBe(true);
  });

  it("throws when a sequenced gesture's cooldown doesn't outlast its own schedule", () => {
    expect(() =>
      resolveGesture(
        "whirl",
        { members: [0], pivot: [0, 0, 0], rotate: [quat("y", 90), quat("y", 180)], cooldown: 2 },
        TICK_EVERY,
      ),
    ).toThrow(/comes home .* cooldown of 2/);
  });

  it("does not require the cooldown to outlast the schedule for a plain one-step gesture", () => {
    expect(() =>
      resolveGesture("bob", { members: [0], pivot: [0, 0, 0], rotate: quat("x", 8), cooldown: 1 }, TICK_EVERY),
    ).not.toThrow();
  });

  it("throws when onFire lands at or after the cooldown", () => {
    expect(() =>
      resolveGesture(
        "jab",
        { members: [0], pivot: [0, 0, 0], rotate: quat("x", 45), cooldown: 5, fireAfter: 5, onFire: () => {} },
        TICK_EVERY,
      ),
    ).toThrow(/fires its hit 5 ticks in but has a cooldown of 5/);
  });

  it("ignores fireAfter when there is no onFire's delay in play (fireAfter: 0 is the default, unused)", () => {
    expect(() =>
      resolveGesture("jab", { members: [0], pivot: [0, 0, 0], rotate: quat("x", 45), cooldown: 1 }, TICK_EVERY),
    ).not.toThrow();
  });

  it("only checks recoverAfter's deadline when onRecover is actually set", () => {
    // recoverAfter equals the cooldown, but no onRecover, so nothing should fire on this timer.
    expect(() =>
      resolveGesture(
        "reload",
        { members: [0], pivot: [0, 0, 0], rotate: quat("x", 45), cooldown: 3, recoverAfter: 3 },
        TICK_EVERY,
      ),
    ).not.toThrow();
  });

  it("throws when onRecover's delay does not fit inside the cooldown", () => {
    expect(() =>
      resolveGesture(
        "reload",
        {
          members: [0],
          pivot: [0, 0, 0],
          rotate: quat("x", 45),
          cooldown: 3,
          recoverAfter: 3,
          onRecover: () => {},
        },
        TICK_EVERY,
      ),
    ).toThrow(/recovers 3 ticks in but has a cooldown of 3/);
  });
});
