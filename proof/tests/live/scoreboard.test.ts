// Scoreboard arithmetic, which helix lowers score expressions onto.
//
// The edge cases are the point: integer division floors toward negative infinity, modulo is
// Euclidean, and multiplication wraps at 32 bits.
import { beforeAll, expect, it } from "vitest";
import { useServer, type Mc } from "../../src/live";
import { dp, objective } from "../pack";

let mc: Mc;
beforeAll(async () => void (mc = await useServer(dp)), 300_000);

const set = (holder: string, value: number) =>
  mc.cmd(`scoreboard players set ${holder} ${objective} ${value}`);

async function operate(a: number, op: string, b: number): Promise<number | null> {
  await set("#a", a);
  await set("#b", b);
  await mc.cmd(`scoreboard players operation #a ${objective} ${op} #b ${objective}`);
  return mc.score("#a", objective);
}

it("floors division toward negative infinity", async () => {
  expect(await operate(-7, "/=", 2)).toBe(-4);
});

it("takes the Euclidean remainder", async () => {
  expect(await operate(-7, "%=", 2)).toBe(1);
});

it("wraps multiplication at 32 bits", async () => {
  expect(await operate(46341, "*=", 46341)).toBe(-2147479015);
});

it("reports an unset score as null", async () => {
  expect(await mc.score("#never-set", objective)).toBeNull();
});
