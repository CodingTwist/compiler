import { describe, it, expect } from "vitest";
import { Block, Datapack, Detect, Id, Pos, Selector, detect } from "../../index";
import { v26_2 } from "../../versions/26_2";
import { buildDatapack } from "../codegen/codegen";
import type { Detector } from "./detect";

const BUTTON = Block.STONE_BUTTON.state({ powered: true });
const AT = Pos(1, 2, 3);

/** Emit `detector` into one function and return its rendered lines. */
function emit(detector: Detector): string[] {
  const dp = new Datapack("t", v26_2);
  dp.createFunction("f").build((ctx) => detect(ctx, detector, (hit) => hit.say("fired")));
  return buildDatapack(dp).get("data/t/function/f.mcfunction")!.trim().split("\n");
}

describe("Detect", () => {
  it("block() emits one `if block` guard around the hit body", () => {
    expect(emit(Detect.block(AT, BUTTON))).toEqual([
      "execute if block 1 2 3 minecraft:stone_button[powered=true] run say fired",
    ]);
  });

  it("all() merges into a single chain, in call order", () => {
    expect(emit(Detect.all(Detect.entity(Selector.allPlayers()), Detect.block(AT, BUTTON)))).toEqual(
      ["execute if entity @a if block 1 2 3 minecraft:stone_button[powered=true] run say fired"],
    );
  });

  it("near() puts the bounded distance check ahead of what it gates", () => {
    expect(emit(Detect.near(AT, 16, Detect.block(AT, BUTTON)))).toEqual([
      "execute positioned 1 2 3 if entity @a[distance=..16] if block 1 2 3 minecraft:stone_button[powered=true] run say fired",
    ]);
  });

  it("in() states the dimension once for the detector beneath it", () => {
    expect(emit(Detect.in(Id("minecraft:the_end"), Detect.block(AT, BUTTON)))).toEqual([
      "execute in minecraft:the_end if block 1 2 3 minecraft:stone_button[powered=true] run say fired",
    ]);
  });

  it("nests without a wrapper chain: composing costs no extra `execute`", () => {
    const deep = Detect.in(Id("minecraft:the_end"), Detect.near(AT, 8, Detect.block(AT, BUTTON)));
    const [line, ...rest] = emit(deep);
    expect(rest).toEqual([]);
    expect(line.match(/execute/g)).toHaveLength(1);
  });

  it("a clauseless detector emits the body bare, not a vacuous `execute run`", () => {
    expect(emit(Detect.always())).toEqual(["say fired"]);
    expect(emit(Detect.all())).toEqual(["say fired"]);
  });

  it("accepts a hand-written closure wherever a built-in goes", () => {
    const custom: Detector = (c) => void c.ifBlock(AT, BUTTON).ifEntity(Selector.allPlayers());
    expect(emit(Detect.all(custom))).toEqual([
      "execute if block 1 2 3 minecraft:stone_button[powered=true] if entity @a run say fired",
    ]);
  });
});
