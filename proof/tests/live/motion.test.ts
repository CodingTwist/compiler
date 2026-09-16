// Gravity and drag, read off the entity's own velocity vector.
//
// These numbers are what spool's motion maths assumes, so drift in either fails here.
import { beforeAll, beforeEach, expect, it } from "vitest";
import { useServer, type Mc } from "../../src/live";
import { dp } from "../pack";

let mc: Mc;
beforeAll(async () => void (mc = await useServer(dp)), 300_000);
beforeEach(() => mc.reset());

it("accelerates a dropped entity by 0.08 and scales it by 0.98", async () => {
  await mc.cmd('summon armor_stand ~ ~10 ~ {Tags:["drop"],NoGravity:0b}');
  await mc.tick(1);

  expect((await mc.entity({ tag: "drop" })).motion[1]).toBeCloseTo(-0.0784, 6);
});

it("keeps compounding that fall", async () => {
  await mc.cmd('summon armor_stand ~ ~10 ~ {Tags:["drop"],NoGravity:0b}');

  // v(k) = (v(k-1) - 0.08) * 0.98, which is the series spool's fall maths is derived from.
  let expected = 0;
  for (let k = 0; k < 5; k++) {
    expected = (expected - 0.08) * 0.98;
    await mc.tick(1);
    expect((await mc.entity({ tag: "drop" })).motion[1]).toBeCloseTo(expected, 6);
  }
});
